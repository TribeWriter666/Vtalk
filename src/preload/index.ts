import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  onRecordingStatus: (callback) => {
    const listener = (_, status) => callback(status)
    ipcRenderer.on('recording-status', listener)
    return () => ipcRenderer.removeListener('recording-status', listener)
  },
  onWindowShown: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('window-shown', listener)
    return () => ipcRenderer.removeListener('window-shown', listener)
  },
  transcribeAudio: (buffer) => ipcRenderer.invoke('transcribe-audio', buffer),
  pasteText: (text) => ipcRenderer.send('paste-text', text),
  saveTranscript: (transcript) => ipcRenderer.invoke('save-transcript', transcript),
  getTranscripts: (limit, offset) => ipcRenderer.invoke('get-transcripts', limit, offset),
  getStats: () => ipcRenderer.invoke('get-stats'),
  deleteTranscript: (id) => ipcRenderer.invoke('delete-transcript', id),
  checkOpenAIKey: () => ipcRenderer.invoke('check-openai-key'),
  saveOpenAIKey: (key) => ipcRenderer.invoke('save-openai-key', key),
  getOpenAIKey: () => ipcRenderer.invoke('get-openai-key'),
  openRecordingsFolder: () => ipcRenderer.send('open-recordings-folder'),
  exportMetadata: () => ipcRenderer.invoke('export-metadata'),
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
}

// Directly expose without the toolkit helper to be 100% sure
try {
  contextBridge.exposeInMainWorld('api', api)
  // Also expose a simple flag to check if it's working
  contextBridge.exposeInMainWorld('isElectron', true)
} catch (error) {
  console.error('Preload script failed to expose API:', error)
}
