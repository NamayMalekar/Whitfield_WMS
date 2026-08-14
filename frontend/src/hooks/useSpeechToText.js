import { useCallback, useEffect, useRef, useState } from 'react'

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

const BAND_COUNT = 28

/**
 * Web Speech API wrapper for hands-free receiving.
 *
 * Exposes the interim transcript so words appear as they are spoken, the final
 * transcript with the engine's own confidence, and a band-split live level so
 * the widget can draw a real waveform rather than a decorative pulse. That
 * matters on a dock: a ring that does not move is how a receiver finds out the
 * headset is dead *before* they say forty units into it.
 *
 * Everything degrades quietly. No speech engine means `supported` is false and
 * the caller falls back to the manual form.
 */
export function useSpeechToText({ lang = 'en-US', continuous = true, silenceMs = 1800 } = {}) {
  const recognitionRef = useRef(null)
  const audioRef = useRef({ context: null, stream: null, frame: null })
  const manualStopRef = useRef(false)
  const silenceRef = useRef(null)
  const stopRef = useRef(() => {})

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [transcript, setTranscript] = useState('')
  const [confidence, setConfidence] = useState(1)
  const [level, setLevel] = useState(0)
  const [bands, setBands] = useState(() => new Array(BAND_COUNT).fill(0))
  const [error, setError] = useState('')

  const stopMeter = useCallback(() => {
    const audio = audioRef.current
    if (audio.frame) cancelAnimationFrame(audio.frame)
    audio.stream?.getTracks().forEach((track) => track.stop())
    audio.context?.close?.()
    audioRef.current = { context: null, stream: null, frame: null }
    setLevel(0)
    setBands(new Array(BAND_COUNT).fill(0))
  }, [])

  const startMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.75
      context.createMediaStreamSource(stream).connect(analyser)

      const time = new Uint8Array(analyser.fftSize)
      const freq = new Uint8Array(analyser.frequencyBinCount)
      // Speech lives low in the spectrum, so only the first slice is sampled.
      const usable = Math.floor(analyser.frequencyBinCount * 0.45)
      const perBand = Math.max(1, Math.floor(usable / BAND_COUNT))

      const tick = () => {
        analyser.getByteTimeDomainData(time)
        let peak = 0
        for (let i = 0; i < time.length; i += 1) {
          peak = Math.max(peak, Math.abs(time[i] - 128) / 128)
        }
        setLevel(peak)

        analyser.getByteFrequencyData(freq)
        const next = new Array(BAND_COUNT)
        for (let band = 0; band < BAND_COUNT; band += 1) {
          let sum = 0
          for (let i = 0; i < perBand; i += 1) sum += freq[band * perBand + i] || 0
          next[band] = Math.min(1, sum / perBand / 190)
        }
        setBands(next)

        audioRef.current.frame = requestAnimationFrame(tick)
      }

      audioRef.current = { context, stream, frame: requestAnimationFrame(tick) }
    } catch {
      // No mic permission for the meter is survivable - recognition may still work.
    }
  }, [])

  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined

    const recognition = new SpeechRecognitionImpl()
    recognition.lang = lang
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interimText = ''
      let sawFinal = false
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          sawFinal = true
          setTranscript((previous) => `${previous} ${result[0].transcript}`.trim())
          setConfidence(result[0].confidence || 0.9)
        } else {
          interimText += result[0].transcript
        }
      }
      setInterim(interimText)

      // Close the session after a real pause rather than making someone tap a
      // second time with a carton in their hands. Any new speech before the
      // timer fires cancels it, so mid-sentence thinking time is safe.
      if (silenceMs) {
        clearTimeout(silenceRef.current)
        if (sawFinal || interimText) {
          silenceRef.current = setTimeout(() => stopRef.current(), silenceMs)
        }
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      const messages = {
        'no-speech': 'Nothing was picked up. Hold the button and speak closer to the mic.',
        'audio-capture': 'No microphone found. Check the headset is plugged in and selected.',
        'not-allowed': 'Microphone access is blocked. Allow it from the address bar, then try again.',
        network: 'Speech recognition needs a network connection.',
        'service-not-allowed': 'The browser blocked speech recognition. Use Chrome or Edge on this device.',
      }
      setError(messages[event.error] || `Microphone error: ${event.error}`)
      setListening(false)
    }

    recognition.onend = () => {
      setInterim('')
      // Chrome stops on its own after a pause. In a warehouse someone is often
      // still mid-sentence, so keep the session open until they stop it.
      if (!manualStopRef.current && continuous) {
        try {
          recognition.start()
          return
        } catch {
          /* fall through to ending the session */
        }
      }
      setListening(false)
      stopMeter()
    }

    recognitionRef.current = recognition
    return () => {
      manualStopRef.current = true
      clearTimeout(silenceRef.current)
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        /* already stopped */
      }
      stopMeter()
    }
  }, [lang, continuous, silenceMs, stopMeter])

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      setError('This browser has no speech recognition. Use Chrome or Edge, or type it in.')
      return
    }
    manualStopRef.current = false
    clearTimeout(silenceRef.current)
    setError('')
    setTranscript('')
    setInterim('')
    try {
      recognitionRef.current.start()
      setListening(true)
      startMeter()
    } catch {
      // start() throws when it is already running; treat that as listening.
      setListening(true)
    }
  }, [startMeter])

  const stop = useCallback(() => {
    manualStopRef.current = true
    clearTimeout(silenceRef.current)
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
    setListening(false)
    stopMeter()
  }, [stopMeter])

  // The silence timer fires from inside the recognition handler, which closes
  // over the first render, so it reaches `stop` through a ref.
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  const reset = useCallback(() => {
    setTranscript('')
    setInterim('')
    setError('')
    setConfidence(1)
  }, [])

  return {
    supported: Boolean(SpeechRecognitionImpl),
    listening,
    transcript,
    interim,
    confidence,
    level,
    bands,
    error,
    start,
    stop,
    reset,
    setTranscript,
  }
}

export default useSpeechToText
