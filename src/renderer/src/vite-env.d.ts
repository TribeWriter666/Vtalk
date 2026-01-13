/// <reference types="vite/client" />

interface Window {
  isElectron?: boolean
  api: {
    onRecordingStatus: (callback: (status: any) => void) => () => void
    onWindowShown: (callback: () => void) => () => void
    transcribeAudio: (buffer: ArrayBuffer) => Promise<any>
    pasteText: (text: string) => void
    saveTranscript: (data: { text: string; duration: number; audioPath?: string | null }) => Promise<any>
    getTranscripts: (limit: number, offset: number) => Promise<any[]>
    getStats: () => Promise<any>
    deleteTranscript: (id: number) => Promise<void>
    checkOpenAIKey: () => Promise<boolean>
    saveOpenAIKey: (key: string) => Promise<void>
    getOpenAIKey: () => Promise<string>
    openRecordingsFolder: () => void
    exportMetadata: () => Promise<string>
    getSetting: (key: string) => Promise<string | null>
    setSetting: (key: string, value: string) => Promise<void>
    hideOverlay: () => void
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    setTitleBarColor: (color: string) => void
  }
}
