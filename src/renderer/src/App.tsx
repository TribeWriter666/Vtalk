import { useState, useEffect, useRef, useCallback } from 'react'
import { useRecorder } from './hooks/useRecorder'
import { Mic, MicOff, Copy, Trash2, RotateCcw, BarChart3, Clock, Type, Check, Play, Pause, Folder, FileDown, Settings, X, Info, MessageSquare, Minus, Square, Sun, Moon, Monitor } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface Transcript {
  id: number
  text: string
  duration: number
  wpm: number
  audio_path?: string
  created_at: string
  status?: 'transcribing' | 'error' | 'success'
}

export default function App() {
  const { isRecording } = useRecorder()
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [stats, setStats] = useState({ totalWords: 0, totalDuration: 0, avgWpm: 0 })
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const PAGE_SIZE = 50

  const [lastAudio, setLastAudio] = useState<{ buffer: ArrayBuffer, duration: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [saveAudio, setSaveAudio] = useState(false)
  const [cleanupEnabled, setCleanupEnabled] = useState(false)
  const [cleanupStyle, setCleanupStyle] = useState('natural')
  const [customPrompt, setCustomPrompt] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!window.api && !window.isElectron) {
      setError('Connection Error: The App UI cannot communicate with the background process.')
      return
    }

    const checkKey = async () => {
      const hasKey = await window.api.checkOpenAIKey()
      if (!hasKey) {
        setShowSetup(true)
      } else {
        const currentKey = await window.api.getOpenAIKey()
        setApiKey(currentKey)
      }
    }

    const loadSettings = async () => {
      const savedSaveAudio = await window.api.getSetting('save_audio')
      if (savedSaveAudio !== null) {
        setSaveAudio(savedSaveAudio === 'true')
      }

      const savedCleanupEnabled = await window.api.getSetting('cleanup_enabled')
      if (savedCleanupEnabled !== null) {
        setCleanupEnabled(savedCleanupEnabled === 'true')
      }

      const savedCleanupStyle = await window.api.getSetting('cleanup_style')
      if (savedCleanupStyle !== null) {
        setCleanupStyle(savedCleanupStyle)
      }

      const savedCustomPrompt = await window.api.getSetting('cleanup_custom_prompt')
      if (savedCustomPrompt !== null) {
        setCustomPrompt(savedCustomPrompt)
      }

      const savedTheme = await window.api.getSetting('theme')
      if (savedTheme !== null) {
        setTheme(savedTheme as any)
      }
    }

    checkKey()
    loadSettings()
    initialLoad()

    const handleFinished = async (e: any) => {
      const { buffer, duration } = e.detail
      
      // Ignore very short recordings (less than 0.5 seconds)
      if (duration < 0.5) {
        console.log('Recording too short, ignoring:', duration)
        return
      }

      setLastAudio({ buffer, duration })
      // Use ref to always get the latest version of handleTranscription
      await handleTranscriptionRef.current(buffer, duration)
    }

    window.addEventListener('recording-finished' as any, handleFinished)

    const unlistenShown = window.api.onWindowShown(() => {
      initialLoad()
    })

    return () => {
      window.removeEventListener('recording-finished' as any, handleFinished)
      if (unlistenShown) unlistenShown()
    }
  }, [])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !isTranscribing) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, offset, isTranscribing])

  const initialLoad = useCallback(async () => {
    // If we're currently transcribing, don't overwrite the state as it might wipe the placeholder
    if (isTranscribing) return

    const [data, statsData] = await Promise.all([
      window.api.getTranscripts(PAGE_SIZE, 0),
      window.api.getStats()
    ])
    setTranscripts(data)
    setStats(statsData)
    setOffset(data.length)
    setHasMore(data.length === PAGE_SIZE)
  }, [isTranscribing])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const data = await window.api.getTranscripts(PAGE_SIZE, offset)
    if (data.length > 0) {
      setTranscripts(prev => [...prev, ...data])
      setOffset(prev => prev + data.length)
    }
    setHasMore(data.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  const handleTranscription = useCallback(async (buffer: ArrayBuffer, duration: number) => {
    setIsTranscribing(true)
    const tempId = Date.now()
    
    // Add a placeholder
    setTranscripts(prev => [{
      id: tempId,
      text: 'Transcribing...',
      duration,
      wpm: 0,
      created_at: new Date().toISOString(),
      status: 'transcribing'
    }, ...prev])

    try {
      const result = await window.api.transcribeAudio(buffer)
      const { text, audioPath } = typeof result === 'string' ? { text: result, audioPath: null } : result
      
      // Save to DB
      const saved = await window.api.saveTranscript({ text, duration, audioPath })
      
      // Update the placeholder with real data
      setTranscripts(prev => {
        // Remove the placeholder and add the real saved transcript
        const filtered = prev.filter(t => t.id !== tempId)
        // Check if it's already there (maybe from a parallel initialLoad)
        if (filtered.some(t => t.id === saved.id)) return filtered
        return [saved, ...filtered]
      })

      // Refresh stats
      const statsData = await window.api.getStats()
      setStats(statsData)

      // Auto-paste
      window.api.pasteText(text)
    } catch (error: any) {
      console.error('Transcription failed:', error)
      window.api.hideOverlay()
      setTranscripts(prev => prev.map(t => 
        t.id === tempId ? { 
          ...t, 
          text: error.message?.includes('too short') ? 'Recording too short' : 'Failed to transcribe', 
          status: 'error' 
        } : t
      ))
    } finally {
      setIsTranscribing(false)
      // Final sync check to ensure UI matches DB exactly
      setTimeout(() => {
        initialLoad()
      }, 500)
    }
  }, [initialLoad])
  
  // Keep a ref to the latest handleTranscription for event handlers
  const handleTranscriptionRef = useRef(handleTranscription)
  useEffect(() => {
    handleTranscriptionRef.current = handleTranscription
  }, [handleTranscription])

  useEffect(() => {
    const root = window.document.documentElement
    
    const applyTheme = (themeValue: string) => {
      let actualTheme = themeValue
      if (themeValue === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      
      root.classList.remove('light', 'dark')
      root.classList.add(actualTheme)
      
      // Update Electron titlebar overlay color
      if (window.api && (window.api as any).setTitleBarColor) {
        (window.api as any).setTitleBarColor(actualTheme === 'dark' ? '#020617' : '#ffffff')
      }
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    
    return undefined
  }, [theme])

  const retryTranscription = async () => {
    if (lastAudio) {
      await handleTranscription(lastAudio.buffer, lastAudio.duration)
    }
  }

  const deleteTranscript = async (id: number) => {
    await window.api.deleteTranscript(id)
    setTranscripts(prev => prev.filter(t => t.id !== id))
    // Refresh stats
    const statsData = await window.api.getStats()
    setStats(statsData)
  }

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const playAudio = (_path: string, id: number) => {
    if (playingId === id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    // Use the transcript ID to fetch the audio via the atom protocol
    const audio = new Audio(`atom://audio/${id}`)
    audioRef.current = audio
    audio.onerror = () => {
      console.error('Audio error details:', audio.error)
      setPlayingId(null)
    }
    audio.play().catch(_e => {
      console.error('Audio play failed:', _e)
      setPlayingId(null)
    })
    setPlayingId(id)
    audio.onended = () => setPlayingId(null)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await window.api.exportMetadata()
      // Show success briefly
      setTimeout(() => setExporting(false), 2000)
    } catch (e) {
      console.error('Export failed:', e)
      setExporting(false)
    }
  }

  const openRecordingsFolder = () => {
    window.api.openRecordingsFolder()
  }

  const handleMinimize = () => window.api.minimizeWindow()
  const handleMaximize = () => {
    window.api.maximizeWindow()
    setIsMaximized(!isMaximized)
  }
  const handleClose = () => window.api.closeWindow()

  const calculateTotalDuration = () => {
    const totalSeconds = stats.totalDuration
    if (totalSeconds < 60) return `${totalSeconds.toFixed(0)}s`
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.round(totalSeconds % 60)
    return `${mins}m ${secs}s`
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const saveApiKey = async (key: string) => {
    if (!key.trim().startsWith('sk-')) {
      setError('Invalid API Key format. It should start with "sk-"')
      return
    }
    await window.api.saveOpenAIKey(key.trim())
    setApiKey(key.trim())
    setShowSetup(false)
    setError(null)
  }

  const toggleSaveAudio = async () => {
    const newValue = !saveAudio
    setSaveAudio(newValue)
    await window.api.setSetting('save_audio', String(newValue))
  }

  const toggleCleanup = async () => {
    const newValue = !cleanupEnabled
    setCleanupEnabled(newValue)
    await window.api.setSetting('cleanup_enabled', String(newValue))
  }

  const updateCleanupStyle = async (style: string) => {
    setCleanupStyle(style)
    await window.api.setSetting('cleanup_style', style)
  }

  const updateCustomPrompt = async (prompt: string) => {
    setCustomPrompt(prompt)
    await window.api.setSetting('cleanup_custom_prompt', prompt)
  }

  const updateTheme = async (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme)
    await window.api.setSetting('theme', newTheme)
  }

  if (!window.api && !error) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-400 p-10 text-center">
        <div className="space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
          <p>Connecting to Electron process...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden relative bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Setup Overlay */}
      <AnimatePresence>
        {showSetup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-white dark:bg-slate-950 flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full space-y-8">
              <div className="text-center space-y-2">
                <div className="inline-flex p-4 rounded-3xl bg-blue-500/10 text-blue-500 mb-4">
                  <Mic size={48} />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome to Vtalk</h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium">To get started, we need your OpenAI API Key for the Whisper transcription engine.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">
                    OpenAI API Key
                  </label>
                  <input 
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                </div>

                <button 
                  onClick={() => saveApiKey(apiKey)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                >
                  Start Using Vtalk
                </button>

                <div className="pt-4 border-t border-slate-800/50 text-center">
                  <a 
                    href="https://www.youtube.com/watch?v=eqOfr4AgLk8" 
                    target="_blank"
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    Need help getting an API key? Watch this tutorial →
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="bg-red-600 text-white p-2 text-center text-sm">
          {error}
        </div>
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 backdrop-blur-sm z-10 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-2.5 rounded-xl transition-all shadow-lg",
            isRecording ? "bg-red-500/20 text-red-500 animate-pulse ring-2 ring-red-500/20" : "bg-blue-500/20 text-blue-500 shadow-blue-500/10"
          )}>
            {isRecording ? <Mic size={28} /> : <MicOff size={28} />}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-br from-slate-900 to-slate-500 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">Vtalk</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 font-bold uppercase tracking-wider text-nowrap">
              {isRecording ? 'Live Recording' : 'Voice Dictation'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <a 
            href="https://smallsites.com/contact" 
            target="_blank"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all group"
            title="Send Feedback"
          >
            <MessageSquare size={18} className="group-hover:scale-110 transition-transform" />
          </a>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all group"
            title="Settings"
          >
            <Settings size={18} className="group-hover:rotate-45 transition-transform" />
          </button>
          
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-1" />

          <button 
            onClick={handleMinimize}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
            title="Minimize"
          >
            <Minus size={18} />
          </button>
          <button 
            onClick={handleMaximize}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <Square size={14} className={isMaximized ? "scale-90" : ""} />
          </button>
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-500 transition-all"
            title="Close to Tray"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex flex-col overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto w-full p-6 pb-20">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <Settings className="text-blue-500 dark:text-blue-400" /> Settings
                </h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

                  <div className="space-y-6">
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-[0.15em] ml-1">Appearance</h3>
                    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">
                          Theme Mode
                        </label>
                        <div className="flex p-1 bg-slate-100 dark:bg-slate-950 rounded-xl gap-1">
                          {[
                            { id: 'light', label: 'Light', icon: Sun },
                            { id: 'dark', label: 'Dark', icon: Moon },
                            { id: 'system', label: 'System', icon: Monitor },
                          ].map((t) => (
                            <button
                              key={t.id}
                              onClick={() => updateTheme(t.id as any)}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all",
                                theme === t.id 
                                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" 
                                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                              )}
                            >
                              <t.icon size={16} />
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-[0.15em] ml-1">Storage & AI Training</h3>
                    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-5 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-slate-800 dark:text-slate-200">Save Audio Recordings</div>
                          <div className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed max-w-[280px]">
                            Saves high-quality Mono MP3 files of your recordings. Perfect for Eleven Labs voice cloning.
                          </div>
                        </div>
                        <button 
                          onClick={toggleSaveAudio}
                          className={cn(
                            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none shrink-0",
                            saveAudio ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                            saveAudio ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>

                      {saveAudio && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-200/80"
                        >
                          <Info size={16} className="shrink-0 mt-0.5 text-blue-500" />
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-medium leading-normal">
                              This feature allows you to gather the ~2.5 hours of audio material needed to create a high-quality personal voice clone (e.g., via Eleven Labs).
                            </p>
                            <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 italic leading-normal">
                              Note: Keeping this enabled will consume disk space over time as your recording library grows.
                            </p>
                          </div>
                        </motion.div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <button 
                          onClick={handleExport}
                          disabled={exporting}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2.5 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl transition-all group",
                            exporting ? "border-emerald-500/50 bg-emerald-500/5" : "hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 shadow-sm"
                          )}
                        >
                          {exporting ? <Check size={20} className="text-emerald-500" /> : <FileDown size={20} className="text-emerald-600 dark:text-emerald-500 group-hover:scale-110 transition-transform" />}
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center">Export CSV<br/><span className="text-[10px] opacity-50 font-medium">For Eleven Labs</span></div>
                        </button>

                        <button 
                          onClick={openRecordingsFolder}
                          className="flex flex-col items-center justify-center gap-2.5 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all group shadow-sm"
                        >
                          <Folder size={20} className="text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center">Open Folder<br/><span className="text-[10px] opacity-50 font-medium">Manage Files</span></div>
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-[0.15em] ml-1">Dictation Cleanup</h3>
                    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-6 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-slate-800 dark:text-slate-200">Enable AI Cleanup</div>
                          <div className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed max-w-[280px]">
                            Automatically removes filler words and intelligently rewrites text.
                          </div>
                        </div>
                        <button 
                          onClick={toggleCleanup}
                          className={cn(
                            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none shrink-0",
                            cleanupEnabled ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                          )}
                        >
                          <span className={cn(
                            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                            cleanupEnabled ? "translate-x-6" : "translate-x-1"
                          )} />
                        </button>
                      </div>

                      {cleanupEnabled && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-700 dark:text-amber-200/80"
                        >
                          <Info size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                          <p className="text-[11px] font-medium leading-normal">
                            Note: Enabling AI cleanup adds a second processing step after transcription, which will slightly increase the total processing time.
                          </p>
                        </motion.div>
                      )}

                      {cleanupEnabled && (
                        <div className="space-y-5 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                          <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">
                              Writing Style
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { id: 'natural', label: 'Natural', desc: 'Clean fillers', speed: 'Mini' },
                                { id: 'professional', label: 'Professional', desc: 'Formal & Polished', speed: '5.2' },
                                { id: 'casual', label: 'Casual', desc: 'Friendly & Brief', speed: '5.2' },
                                { id: 'concise', label: 'Concise', desc: 'Short & Direct', speed: 'Nano' },
                              ].map((style) => (
                                <button
                                  key={style.id}
                                  onClick={() => updateCleanupStyle(style.id)}
                                  className={cn(
                                    "p-3.5 rounded-xl border text-left transition-all relative overflow-hidden shadow-sm",
                                    cleanupStyle === style.id 
                                      ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/50 text-blue-600 dark:text-blue-400" 
                                      : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                                  )}
                                >
                                  {style.speed && (
                                    <div className={cn(
                                      "absolute top-0 right-0 text-[10px] px-2 py-1 rounded-bl-lg font-bold uppercase tracking-tighter",
                                      style.speed === '5.2' ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500" : 
                                      style.speed === 'Mini' ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-500" : 
                                      "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-500"
                                    )}>
                                      {style.speed}
                                    </div>
                                  )}
                                  <div className="text-sm font-bold mb-0.5">{style.label}</div>
                                  <div className="text-xs opacity-60 leading-tight font-medium">{style.desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex justify-between items-center px-0.5">
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Custom Instructions
                              </label>
                              <span className="text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest">Optional</span>
                            </div>
                            <textarea 
                              value={customPrompt}
                              onChange={(e) => updateCustomPrompt(e.target.value)}
                              placeholder="e.g. 'Rewrite as a tweet' or 'Translate to German'"
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 transition-all min-h-[100px] resize-none leading-relaxed shadow-inner"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-[0.15em] ml-1">Account</h3>
                    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
                      <div className="flex justify-between items-center px-0.5">
                        <span className="text-sm text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider">OpenAI API Key</span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-md uppercase font-black tracking-widest",
                          apiKey ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                        )}>
                          {apiKey ? 'Connected' : 'Missing'}
                        </span>
                      </div>
                      <div className="relative">
                        <input 
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          onBlur={() => saveApiKey(apiKey)}
                          placeholder="sk-..."
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 transition-all font-mono shadow-inner"
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed px-0.5 font-medium">
                        Your key is stored locally and used only for Whisper and GPT-5 processing.
                      </p>
                    </div>
                  </section>
                </div>

              <div className="mt-12 pt-6 text-center border-t border-slate-800/50">
                <p className="text-[10px] text-slate-600 mb-2">Vtalk v1.0.0 • Built for Productivity</p>
                <a 
                  href="https://smallsites.com/contact" 
                  target="_blank"
                  className="text-[10px] text-blue-500/60 hover:text-blue-500 font-bold uppercase tracking-widest transition-colors"
                >
                  Report a Bug or Suggest a Feature
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sub-header Stats Bar */}
      <div className="flex items-center justify-around px-6 py-4 bg-white/40 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800/60 shadow-inner">
        <div className="flex flex-col items-center group cursor-default">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
            <BarChart3 size={12} /> Avg. WPM
          </div>
          <div className="text-xl font-mono font-bold text-blue-600/90 dark:text-blue-400/90 tabular-nums">
            {stats.avgWpm}
          </div>
        </div>
        
        <div className="w-px h-10 bg-slate-200 dark:bg-slate-800/60" />

        <div className="flex flex-col items-center group cursor-default">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            <Type size={12} /> Total Words
          </div>
          <div className="text-xl font-mono font-bold text-emerald-600/90 dark:text-emerald-400/90 tabular-nums">
            {stats.totalWords}
          </div>
        </div>

        <div className="w-px h-10 bg-slate-200 dark:bg-slate-800/60" />

        <div className="flex flex-col items-center group cursor-default">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
            <Clock size={12} /> Total Time
          </div>
          <div className="text-xl font-mono font-bold text-amber-600/90 dark:text-amber-400/90 tabular-nums">
            {calculateTotalDuration()}
          </div>
        </div>
      </div>

      {/* Quick Tips / Help Bar */}
      {!isRecording && (
        <div className="px-6 py-2 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/40 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
            Hold <span className="text-blue-600 dark:text-blue-500/80">Ctrl + Alt</span> to Record • Quick Tap to <span className="text-emerald-600 dark:text-emerald-500/80">Toggle ON/OFF</span>
          </p>
        </div>
      )}

      {/* Recording Overlay/Feedback */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-white/90 dark:bg-slate-900/90 border border-blue-200 dark:border-blue-500/50 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
              <div className="flex gap-1 h-6 items-center">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: [8, 24, 8],
                    }}
                    transition={{ 
                      duration: 0.6, 
                      repeat: Infinity, 
                      delay: i * 0.1,
                      ease: "easeInOut"
                    }}
                    className="w-1 bg-blue-500 rounded-full"
                  />
                ))}
              </div>
              <div className="text-blue-600 dark:text-blue-400 font-bold text-sm">Recording Voice...</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto w-full space-y-4">
          <AnimatePresence initial={false}>
            {transcripts.map((transcript) => (
              <motion.div
                key={transcript.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={cn(
                  "p-4 rounded-xl border transition-all",
                  transcript.status === 'transcribing' ? "bg-slate-100/50 dark:bg-slate-900/30 border-slate-300 dark:border-slate-800 border-dashed" :
                  transcript.status === 'error' ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50" :
                  "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none"
                )}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} /> {formatDateTime(transcript.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BarChart3 size={14} /> {Math.round(transcript.wpm)} WPM
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-400 dark:text-slate-600">
                      <Type size={14} /> {transcript.duration.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {transcript.audio_path && (
                      <button 
                        onClick={() => playAudio(transcript.audio_path!, transcript.id)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title={playingId === transcript.id ? "Pause" : "Play Recording"}
                      >
                        {playingId === transcript.id ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                    )}
                    {transcript.status === 'error' && (
                      <button 
                        onClick={retryTranscription}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Retry last transcription"
                      >
                        <RotateCcw size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => copyToClipboard(transcript.text, transcript.id)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedId === transcript.id ? <Check size={18} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={18} />}
                    </button>
                    <button 
                      onClick={() => deleteTranscript(transcript.id)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <p className={cn(
                  "text-slate-700 dark:text-slate-200 leading-relaxed text-[15px] whitespace-pre-wrap break-words",
                  transcript.status === 'transcribing' && "text-slate-400 dark:text-slate-500 italic"
                )}>
                  {transcript.text}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Sentinel for infinite scroll */}
          <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
            {loadingMore && (
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            )}
          </div>

          {transcripts.length === 0 && !isTranscribing && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-4 py-20">
              <div className="p-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-inner">
                <Mic size={48} className="opacity-40 dark:opacity-20" />
              </div>
              <p className="font-medium">Your transcripts will appear here</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer / Transcribing Status */}
      {isTranscribing && (
        <div className="px-6 py-3 bg-blue-600 dark:bg-blue-600 text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
          <RotateCcw size={14} className="animate-spin" />
          Processing with AI...
        </div>
      )}
    </div>
  )
}

