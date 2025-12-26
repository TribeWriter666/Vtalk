import { useState, useRef, useEffect } from 'react'

export function useRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startTime = useRef<number>(0)

  useEffect(() => {
    if (!window.api) return
    
    // @ts-ignore (electron api)
    window.api.onRecordingStatus((status: boolean) => {
      if (status) {
        start()
      } else {
        stop()
      }
    })
  }, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      chunks.current = []
      startTime.current = Date.now()

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data)
        }
      }

      mediaRecorder.current.onstop = async () => {
        const duration = (Date.now() - startTime.current) / 1000
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        const buffer = await blob.arrayBuffer()
        
        // Signal to App that we have a recording
        window.dispatchEvent(new CustomEvent('recording-finished', { 
          detail: { buffer, duration } 
        }))
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.current.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Error starting recording:', err)
    }
  }

  const stop = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }

  return { isRecording }
}

