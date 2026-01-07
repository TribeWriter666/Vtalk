import { useState, useEffect, useRef } from 'react'
import { useRecorder } from './hooks/useRecorder'
import { Mic, MicOff, Copy, Trash2, RotateCcw, BarChart3, Clock, Type, Check, Play, Pause, Folder } from 'lucide-react'
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
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [lastAudio, setLastAudio] = useState<{ buffer: ArrayBuffer, duration: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // @ts-ignore
    if (!window.api && !window.isElectron) {
      setError('Connection Error: The App UI cannot communicate with the background process.')
      return
    }

    const checkKey = async () => {
      // @ts-ignore
      const hasKey = await window.api.checkOpenAIKey()
      if (!hasKey) {
        setError('OpenAI API Key not found. Please check your .env file.')
      }
    }

    checkKey()
    loadTranscripts()

    const handleFinished = async (e: any) => {
      const { buffer, duration } = e.detail
      setLastAudio({ buffer, duration })
      await handleTranscription(buffer, duration)
    }

    window.addEventListener('recording-finished' as any, handleFinished)
    return () => window.removeEventListener('recording-finished' as any, handleFinished)
  }, [])

  const loadTranscripts = async () => {
    // @ts-ignore
    const data = await window.api.getTranscripts()
    setTranscripts(data)
  }

  const handleTranscription = async (buffer: ArrayBuffer, duration: number) => {
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
      // @ts-ignore
      const result = await window.api.transcribeAudio(buffer)
      const { text, audioPath } = typeof result === 'string' ? { text: result, audioPath: null } : result
      
      // Save to DB
      // @ts-ignore
      const saved = await window.api.saveTranscript({ text, duration, audioPath })
      
      // Update the placeholder with real data
      setTranscripts(prev => [
        saved,
        ...prev.filter(t => t.id !== tempId)
      ])

      // Auto-paste
      // @ts-ignore
      window.api.pasteText(text)
    } catch (error) {
      console.error('Transcription failed:', error)
      setTranscripts(prev => prev.map(t => 
        t.id === tempId ? { ...t, text: 'Failed to transcribe', status: 'error' } : t
      ))
    } finally {
      setIsTranscribing(false)
    }
  }

  const retryTranscription = async () => {
    if (lastAudio) {
      await handleTranscription(lastAudio.buffer, lastAudio.duration)
    }
  }

  const deleteTranscript = async (id: number) => {
    // @ts-ignore
    await window.api.deleteTranscript(id)
    setTranscripts(prev => prev.filter(t => t.id !== id))
  }

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const playAudio = (path: string, id: number) => {
    if (playingId === id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    // Properly encode the path for the atom protocol
    const encodedPath = encodeURIComponent(path).replace(/%3A/g, ':').replace(/%5C/g, '/')
    const audio = new Audio(`atom:///${encodedPath}`)
    audioRef.current = audio
    audio.play().catch(e => console.error('Audio play failed:', e))
    setPlayingId(id)
    audio.onended = () => setPlayingId(null)
  }

  const openRecordingsFolder = () => {
    // @ts-ignore
    window.api.openRecordingsFolder()
  }

  const calculateAverageWpm = () => {
    if (transcripts.length === 0) return 0
    const valid = transcripts.filter(t => t.wpm > 0)
    if (valid.length === 0) return 0
    return Math.round(valid.reduce((acc, t) => acc + t.wpm, 0) / valid.length)
  }

  const calculateTotalDuration = () => {
    const totalSeconds = transcripts.reduce((acc, t) => acc + t.duration, 0)
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
    <div className="flex flex-col h-screen overflow-hidden">
      {error && (
        <div className="bg-red-600 text-white p-2 text-center text-sm">
          {error}
        </div>
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg transition-colors",
            isRecording ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-blue-500/20 text-blue-500"
          )}>
            {isRecording ? <Mic size={24} /> : <MicOff size={24} />}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Vtalk</h1>
            <p className="text-xs text-slate-400">
              {isRecording ? 'Recording... (Release Ctrl+Start to stop)' : 'Press Ctrl+Start to record'}
            </p>
          </div>
        </div>

        <button 
          onClick={openRecordingsFolder}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-all text-sm group"
          title="Open Recordings Folder"
        >
          <Folder size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
          <span>Recordings</span>
        </button>
      </header>

      {/* Sub-header Stats Bar */}
      <div className="flex items-center justify-around px-6 py-3 bg-slate-900/30 border-b border-slate-800/50">
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-0.5">
            <BarChart3 size={10} /> Avg. WPM
          </div>
          <div className="text-sm font-mono font-bold text-blue-400">
            {calculateAverageWpm()}
          </div>
        </div>
        
        <div className="w-px h-6 bg-slate-800/50" />

        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-0.5">
            <Type size={10} /> Total Words
          </div>
          <div className="text-sm font-mono font-bold text-emerald-400">
            {transcripts.reduce((acc, t) => acc + (t.text.split(/\s+/).length || 0), 0)}
          </div>
        </div>

        <div className="w-px h-6 bg-slate-800/50" />

        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-0.5">
            <Clock size={10} /> Total Time
          </div>
          <div className="text-sm font-mono font-bold text-amber-400">
            {calculateTotalDuration()}
          </div>
        </div>
      </div>

      {/* Recording Overlay/Feedback */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-slate-900/90 border border-blue-500/50 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
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
              <div className="text-blue-400 font-medium text-sm">Recording Voice...</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        <AnimatePresence initial={false}>
          {transcripts.map((transcript) => (
            <motion.div
              key={transcript.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={cn(
                "p-4 rounded-xl border transition-all",
                transcript.status === 'transcribing' ? "bg-slate-900/30 border-slate-800 border-dashed" :
                transcript.status === 'error' ? "bg-red-950/20 border-red-900/50" :
                "bg-slate-900/50 border-slate-800 hover:border-slate-700"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {formatDateTime(transcript.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 size={12} /> {Math.round(transcript.wpm)} WPM
                  </span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <Type size={12} /> {transcript.duration.toFixed(1)}s
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {transcript.audio_path && (
                    <button 
                      onClick={() => playAudio(transcript.audio_path!, transcript.id)}
                      className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-blue-400 transition-colors"
                      title={playingId === transcript.id ? "Pause" : "Play Recording"}
                    >
                      {playingId === transcript.id ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  )}
                  {transcript.status === 'error' && (
                    <button 
                      onClick={retryTranscription}
                      className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                      title="Retry last transcription"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                  <button 
                    onClick={() => copyToClipboard(transcript.text, transcript.id)}
                    className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedId === transcript.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  </button>
                  <button 
                    onClick={() => deleteTranscript(transcript.id)}
                    className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className={cn(
                "text-slate-200 leading-relaxed",
                transcript.status === 'transcribing' && "text-slate-500 italic"
              )}>
                {transcript.text}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {transcripts.length === 0 && !isTranscribing && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 py-20">
            <div className="p-4 rounded-full bg-slate-900 border border-slate-800">
              <Mic size={48} className="opacity-20" />
            </div>
            <p>Your transcripts will appear here</p>
          </div>
        )}
      </main>

      {/* Footer / Transcribing Status */}
      {isTranscribing && (
        <div className="px-6 py-2 bg-blue-600 text-white text-xs font-medium flex items-center justify-center gap-2">
          <RotateCcw size={12} className="animate-spin" />
          Processing with Whisper AI...
        </div>
      )}
    </div>
  )
}

