import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  onRecordingStatus: (callback) => {
    const listener = (_, status) => callback(status)
    ipcRenderer.on('recording-status', listener)
    return () => ipcRenderer.removeListener('recording-status', listener)
  },
  transcribeAudio: (buffer) => ipcRenderer.invoke('transcribe-audio', buffer),
  pasteText: (text) => ipcRenderer.send('paste-text', text),
  saveTranscript: (transcript) => ipcRenderer.invoke('save-transcript', transcript),
  getTranscripts: () => ipcRenderer.invoke('get-transcripts'),
  deleteTranscript: (id) => ipcRenderer.invoke('delete-transcript', id),
  checkOpenAIKey: () => ipcRenderer.invoke('check-openai-key')
}

// Directly expose without the toolkit helper to be 100% sure
try {
  contextBridge.exposeInMainWorld('api', api)
  // Also expose a simple flag to check if it's working
  contextBridge.exposeInMainWorld('isElectron', true)
  console.log('Preload script executed successfully')
} catch (error) {
  console.error('Preload script failed to expose API:', error)
}
