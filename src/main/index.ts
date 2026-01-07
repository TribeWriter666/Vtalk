import { app, shell, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, Notification, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { saveTranscript, getTranscripts, deleteTranscript, getSetting, setSetting, getStats, getAllTranscriptsIter } from './db'

// Use require for native modules to avoid bundling issues
const GKL = require('node-global-key-listener')
const GlobalKeyboardListener = GKL.GlobalKeyboardListener || GKL
const dotenv = require('dotenv')
const OpenAI = require('openai')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath)

// Register atom protocol as privileged to allow streaming/seeking
protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'atom', 
    privileges: { 
      standard: true, 
      secure: true, 
      supportFetchAPI: true, 
      stream: true,
      bypassCSP: true 
    } 
  }
])

// Fix for GPU/Cache errors on Windows
app.commandLine.appendSwitch('disable-gpu-cache')

// Ensure only one instance is running
const instanceLock = app.requestSingleInstanceLock()
if (!instanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// Load .env from project root
const envPath = path.join(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
} else {
  dotenv.config()
}

let openai: any = null

function updateOpenAIClient(apiKey: string) {
  openai = new OpenAI({
    apiKey: apiKey
  })
}

// Initialize with key from DB or .env
const storedKey = getSetting('openai_api_key') || process.env.OPENAI_API_KEY
if (storedKey) {
  updateOpenAIClient(storedKey)
}

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
const keyboardListener = new GlobalKeyboardListener()

function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: 200,
    height: 60,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      sandbox: false
    }
  })

  // Set to highest possible level to stay above everything
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  // Center bottom of the screen
  const { screen } = require('electron')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize
  overlayWindow.setPosition(
    Math.floor((width - 200) / 2),
    Math.floor(height - 80)
  )

  // Make it ignore mouse events (click-through)
  overlayWindow.setIgnoreMouseEvents(true)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, '..', 'preload', 'index.js')
  console.log('Preload path:', preloadPath)

  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#020617',
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // if (is.dev) {
    //   mainWindow?.webContents.openDevTools({ mode: 'detach' })
    // }
  })

  // Handle renderer crashes
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('Render process gone:', details)
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      console.log('Attempting to reload crashed renderer...')
      mainWindow?.reload()
    }
  })

  mainWindow.on('unresponsive', () => {
    console.warn('Window is unresponsive. It might be frozen.')
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
    return false
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading renderer from URL:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const indexPath = join(__dirname, '../renderer/index.html')
    console.log('Loading renderer from file:', indexPath)
    mainWindow.loadFile(indexPath)
  }
}

function createTray() {
  const icon = nativeImage.createEmpty() // You should add a real icon here
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      isQuitting = true
      app.quit()
    }}
  ])
  tray.setToolTip('Vtalk - Voice Dictation')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  // Set app user model id for windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vtalk.app')
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createOverlayWindow()
  createTray()

  // Register protocol to serve local audio files safely by ID
  protocol.handle('atom', async (request) => {
    try {
      const url = new URL(request.url)
      // If URL is atom://audio/123, hostname is 'audio', pathname is '/123'
      const id = parseInt(url.pathname.replace(/^\//, ''))
      
      if (isNaN(id)) {
        console.error('Invalid ID in protocol request:', request.url)
        return new Response(null, { status: 400 })
      }

      const transcripts = await getTranscripts()
      const transcript = transcripts.find(t => t.id === id)
      
      if (!transcript || !transcript.audio_path) {
        console.error('Transcript or audio path not found for ID:', id)
        return new Response(null, { status: 404 })
      }

      if (!fs.existsSync(transcript.audio_path)) {
        console.error('Audio file does not exist on disk:', transcript.audio_path)
        return new Response(null, { status: 404 })
      }

      // Delegate to net.fetch with a file:// URL. 
      // This is the most robust way as it handles Range headers, 
      // streaming, and MIME types automatically.
      const fileUrl = pathToFileURL(transcript.audio_path).toString()
      return net.fetch(fileUrl, {
        bypassCustomProtocolHandlers: true,
        method: request.method,
        headers: request.headers
      })
    } catch (e) {
      console.error('Protocol error:', e)
      return new Response(null, { status: 500 })
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
})

app.on('will-quit', () => {
  // Clean up keyboard listener on quit
  if (keyboardListener) {
    keyboardListener.kill()
  }
})

// --- Logic for Voice Dictation ---

let isRecording = false
let isContinuous = false
let currentHotkey: string[] = []

keyboardListener.addListener((e) => {
  const name = e.name
  if (!name) return

  if (e.state === 'DOWN') {
    if (!currentHotkey.includes(name)) currentHotkey.push(name)
  } else {
    currentHotkey = currentHotkey.filter((k) => k !== name)
  }

  const isCtrl = currentHotkey.includes('LEFT CTRL') || currentHotkey.includes('RIGHT CTRL')
  const isMeta = currentHotkey.includes('LEFT META') || currentHotkey.includes('RIGHT META') || currentHotkey.includes('INS')
  const isSpace = currentHotkey.includes('SPACE')

  if (e.state === 'DOWN') {
    // If we are already recording...
    if (isRecording) {
      if (isContinuous) {
        // Stop continuous if Ctrl + Start is pressed (and we just pressed one of them)
        if (isCtrl && isMeta && !isSpace) {
          stopRecording()
        }
      } else {
        // Upgrade to continuous if Space is pressed while holding modifiers
        if (isSpace && isCtrl && isMeta) {
          isContinuous = true
          console.log('Recording mode: Continuous (Toggled by Space)')
        }
      }
      return
    }

    // If we are NOT recording, start it when Ctrl + Start are pressed
    if (isCtrl && isMeta) {
      isContinuous = isSpace
      startRecording()
      console.log(`Recording mode: ${isContinuous ? 'Continuous' : 'Hold'}`)
    }
  } else if (e.state === 'UP') {
    // If we are in "Hold" mode, stop when modifiers are released
    if (isRecording && !isContinuous) {
      if (!isCtrl || !isMeta) {
        stopRecording()
      }
    }
  }
})

function startRecording() {
  if (isRecording) return
  isRecording = true
  console.log('Recording started...')
  
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.send('recording-status', true)
    } catch (e) {
      console.error('Failed to send recording-status:', e)
    }
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.show()
    overlayWindow.webContents.send('recording-status', true)
  }
  
  // if (Notification.isSupported()) {
  //   new Notification({ title: 'Vtalk', body: 'Recording started...' }).show()
  // }
}

function stopRecording() {
  if (!isRecording) return
  isRecording = false
  console.log('Recording stopped...')

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.send('recording-status', false)
    } catch (e) {
      console.error('Failed to send recording-status:', e)
    }
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
    overlayWindow.webContents.send('recording-status', false)
  }
}

ipcMain.handle('transcribe-audio', async (_, buffer: Buffer) => {
  try {
    const tempFile = path.join(app.getPath('temp'), `vtalk_${Date.now()}.webm`)
    fs.writeFileSync(tempFile, Buffer.from(buffer))

    // Start transcription
    const transcriptionPromise = openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1'
    })

    const shouldSaveAudio = getSetting('save_audio') !== 'false'
    let audioPath: string | null = null

    if (shouldSaveAudio) {
      const recordingsDir = path.join(app.getPath('userData'), 'recordings')
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true })
      }

      const timestamp = Date.now()
      const permanentFile = path.join(recordingsDir, `recording_${timestamp}.mp3`)

      // Conversion happens in parallel with transcription
      // Using high quality MP3 (192k) and forcing mono (-ac 1)
      const conversionPromise = new Promise<string>((resolve, reject) => {
        ffmpeg(tempFile)
          .toFormat('mp3')
          .audioBitrate('192k')
          .audioChannels(1) // Force mono
          .on('end', () => resolve(permanentFile))
          .on('error', (err) => reject(err))
          .save(permanentFile)
      })

      const [response, pAudioPath] = await Promise.all([
        transcriptionPromise,
        conversionPromise
      ])
      
      audioPath = pAudioPath
      fs.unlinkSync(tempFile)
      return { text: response.text, audioPath }
    } else {
      const response = await transcriptionPromise
      fs.unlinkSync(tempFile)
      return { text: response.text, audioPath: null }
    }
  } catch (error) {
    console.error('Transcription error:', error)
    if (Notification.isSupported()) {
      new Notification({ title: 'Vtalk', body: 'Transcription failed.' }).show()
    }
    throw error
  }
})

ipcMain.handle('save-transcript', async (_, { text, duration, audioPath }) => {
  return saveTranscript(text, duration, audioPath)
})

ipcMain.handle('get-transcripts', async (_, limit, offset) => {
  return getTranscripts(limit, offset)
})

ipcMain.handle('get-stats', async () => {
  return getStats()
})

ipcMain.handle('delete-transcript', async (_, id) => {
  return deleteTranscript(id)
})

ipcMain.handle('check-openai-key', async () => {
  const key = getSetting('openai_api_key') || process.env.OPENAI_API_KEY
  return !!key
})

ipcMain.handle('save-openai-key', async (_, key: string) => {
  setSetting('openai_api_key', key)
  updateOpenAIClient(key)
  return true
})

ipcMain.handle('get-openai-key', async () => {
  return getSetting('openai_api_key') || process.env.OPENAI_API_KEY || ''
})

ipcMain.handle('get-setting', async (_, key: string) => {
  return getSetting(key)
})

ipcMain.handle('set-setting', async (_, key: string, value: string) => {
  return setSetting(key, value)
})

ipcMain.on('open-recordings-folder', () => {
  const recordingsDir = path.join(app.getPath('userData'), 'recordings')
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true })
  }
  shell.openPath(recordingsDir)
})

ipcMain.handle('export-metadata', async () => {
  try {
    const recordingsDir = path.join(app.getPath('userData'), 'recordings')
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true })
    }
    const csvPath = path.join(recordingsDir, 'metadata.csv')
    
    const writeStream = fs.createWriteStream(csvPath)
    writeStream.write('audio_file,transcript\n')

    for (const t of getAllTranscriptsIter()) {
      if (t.audio_path && fs.existsSync(t.audio_path)) {
        const fileName = path.basename(t.audio_path)
        const escapedText = t.text.replace(/"/g, '""')
        writeStream.write(`${fileName},"${escapedText}"\n`)
      }
    }

    return new Promise((resolve, reject) => {
      writeStream.end(() => resolve(csvPath))
      writeStream.on('error', reject)
    })
  } catch (error) {
    console.error('Export failed:', error)
    throw error
  }
})

ipcMain.on('paste-text', async (_, text: string) => {
  const originalClipboard = clipboard.readText()
  clipboard.writeText(text)
  
  if (process.platform === 'win32') {
    const script = `
      $wshell = New-Object -ComObject WScript.Shell;
      Sleep -m 100;
      $wshell.SendKeys('^v');
    `
    const tempScript = path.join(app.getPath('temp'), 'paste.ps1')
    fs.writeFileSync(tempScript, script)
    exec(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, () => {
      setTimeout(() => {
        clipboard.writeText(originalClipboard)
        try { fs.unlinkSync(tempScript) } catch(e) {}
      }, 1000)
    })
  } else if (process.platform === 'darwin') {
    const script = `osascript -e 'tell application "System Events" to keystroke "v" using command down'`
    exec(script, () => {
      setTimeout(() => {
        clipboard.writeText(originalClipboard)
      }, 1000)
    })
  }
})

