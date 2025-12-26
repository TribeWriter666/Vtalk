/// <reference types="vite/client" />

interface Window {
  isElectron?: boolean
  api: {
    onRecordingStatus: (callback: (status: boolean) => void) => void
    transcribeAudio: (buffer: ArrayBuffer) => Promise<string>
    pasteText: (text: string) => void
    saveTranscript: (data: { text: string; duration: number }) => Promise<any>
    getTranscripts: () => Promise<any[]>
    deleteTranscript: (id: number) => Promise<void>
    checkOpenAIKey: () => Promise<boolean>
  }
}

