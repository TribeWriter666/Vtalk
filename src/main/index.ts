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
let ffmpegPath = require('ffmpeg-static')

// Set ffmpeg path with asar support
if (typeof ffmpegPath === 'string') {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
}
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
try {
  const envPath = is.dev 
    ? path.join(process.cwd(), '.env')
    : path.join(process.resourcesPath, '.env')
    
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
  } else {
    dotenv.config()
  }
} catch (e) {
  console.error('Error loading .env:', e)
}

let openai: any = null

function updateOpenAIClient(apiKey: string) {
  if (!apiKey) return
  openai = new OpenAI({
    apiKey: apiKey
  })
}

// Initialize with key from DB or .env
try {
  const storedKey = getSetting('openai_api_key') || process.env.OPENAI_API_KEY
  if (storedKey) {
    updateOpenAIClient(storedKey)
  }
} catch (e) {
  console.error('Failed to initialize OpenAI client:', e)
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
      sandbox: false,
      backgroundThrottling: false
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
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('show', () => {
    mainWindow?.webContents.send('window-shown')
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

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const indexPath = join(__dirname, '../renderer/index.html')
    mainWindow.loadFile(indexPath)
  }
}

function createTray() {
  let iconPath
  if (is.dev) {
    iconPath = path.join(__dirname, '../../icon.png')
  } else {
    // In production, icon is usually in the resources folder
    iconPath = path.join(process.resourcesPath, 'icon.png')
    if (!fs.existsSync(iconPath)) {
      // Fallback to app path if not found
      iconPath = path.join(app.getAppPath(), 'out/renderer/icon.png')
    }
  }

  const trayIcon = fs.existsSync(iconPath) 
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(trayIcon)
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
  
  tray.on('double-click', () => {
    mainWindow?.show()
  })
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
    try {
      keyboardListener.kill()
    } catch (e) {}
  }
  
  // Force exit to ensure no zombie processes
  process.exit(0)
})

// --- Logic for Voice Dictation ---

let isRecording = false
let isContinuous = false
let currentHotkey: string[] = []
let lastHotkeyPressTime = 0

keyboardListener.addListener((e) => {
  const name = e.name
  if (!name) return

  if (e.state === 'DOWN') {
    if (!currentHotkey.includes(name)) currentHotkey.push(name)
  } else {
    currentHotkey = currentHotkey.filter((k) => k !== name)
  }

  const isCtrl = currentHotkey.includes('LEFT CTRL') || currentHotkey.includes('RIGHT CTRL')
  const isAlt = currentHotkey.includes('LEFT ALT') || currentHotkey.includes('RIGHT ALT')
  const isSpace = currentHotkey.includes('SPACE')

  if (e.state === 'DOWN') {
    // If we are already recording...
    if (isRecording) {
      if (isContinuous) {
        // Stop continuous if Ctrl + Alt is pressed
        if (isCtrl && isAlt && !isSpace) {
          stopRecording()
        }
      } else {
        // Upgrade to continuous if Space is pressed while holding modifiers
        if (isSpace && isCtrl && isAlt) {
          isContinuous = true
          console.log('Recording mode upgraded: Continuous')
        }
      }
      return
    }

    // If we are NOT recording, start it when Ctrl + Alt are pressed
    if (isCtrl && isAlt) {
      lastHotkeyPressTime = Date.now()
      isContinuous = isSpace
      startRecording()
      console.log(`Recording started (${isContinuous ? 'Continuous' : 'Hold'})`)
    }
  } else if (e.state === 'UP') {
    // If we are in "Hold" mode, stop when modifiers are released
    if (isRecording && !isContinuous) {
      if (!isCtrl || !isAlt) {
        // If they released the keys very quickly (under 300ms), assume they meant to toggle
        const holdDuration = Date.now() - lastHotkeyPressTime
        if (holdDuration < 300) {
          isContinuous = true
          console.log('Short press detected: Switching to Continuous mode')
        } else {
          stopRecording()
        }
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
    overlayWindow.webContents.send('recording-status', 'recording')
  }
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
    overlayWindow.webContents.send('recording-status', 'processing')
  }
}

ipcMain.handle('transcribe-audio', async (_, buffer: Buffer) => {
  try {
    const tempFile = path.join(app.getPath('temp'), `vtalk_${Date.now()}.webm`)
    fs.writeFileSync(tempFile, Buffer.from(buffer))

    // Priority: 1. DB Setting, 2. Process Env
    const storedKey = getSetting('openai_api_key')
    const envKey = process.env.OPENAI_API_KEY
    const apiKey = storedKey || envKey

    if (!apiKey) {
      throw new Error('No OpenAI API key found. Please check your settings.')
    }

    // Always ensure the client is fresh
    updateOpenAIClient(apiKey)

    // Start transcription
    const transcriptionPromise = openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1'
    })

    const shouldSaveAudio = getSetting('save_audio') === 'true'
    let audioPath: string | null = null

    if (shouldSaveAudio) {
      const recordingsDir = path.join(app.getPath('userData'), 'recordings')
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true })
      }

      const timestamp = Date.now()
      const permanentFile = path.join(recordingsDir, `recording_${timestamp}.mp3`)

      const conversionPromise = new Promise<string>((resolve, reject) => {
        ffmpeg(tempFile)
          .toFormat('mp3')
          .audioBitrate('192k')
          .audioChannels(1)
          .on('end', () => resolve(permanentFile))
          .on('error', (err) => {
            console.error('FFmpeg error:', err)
            reject(err)
          })
          .save(permanentFile)
      })

      const [response, pAudioPath] = await Promise.all([
        transcriptionPromise,
        conversionPromise
      ])
      
      audioPath = pAudioPath
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
      return { text: response.text, audioPath }
    } else {
      const response = await transcriptionPromise
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
      return { text: response.text, audioPath: null }
    }
  } catch (error: any) {
    console.error('Transcription error details:', error)
    if (Notification.isSupported()) {
      new Notification({ 
        title: 'Vtalk Error', 
        body: error.message || 'Transcription failed.' 
      }).show()
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

ipcMain.on('hide-overlay', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
})

ipcMain.on('paste-text', async (_, text: string) => {
  const originalClipboard = clipboard.readText()
  clipboard.writeText(text)
  
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('recording-status', 'done')
    setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide()
      }
    }, 1500)
  }

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

