import { useCallback, useEffect, useRef, useState } from 'react'

const MUTE_KEY = 'whitfield.voice.muted'

/**
 * Read-back for the voice widget.
 *
 * The read-back is the safety step - it is how a receiver catches "fifteen"
 * heard as "fifty" without looking up from the carton. So it cancels anything
 * still playing before speaking (a queue would read a stale count over a fresh
 * one), prefers a local English voice, and slows down slightly, because numbers
 * at default rate are the first thing lost under a conveyor.
 */
export default function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const voiceRef = useRef(null)
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === '1')
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (!supported) return undefined
    const pick = () => {
      const voices = window.speechSynthesis.getVoices()
      voiceRef.current =
        voices.find((voice) => voice.localService && /^en[-_]US/i.test(voice.lang)) ||
        voices.find((voice) => /^en[-_]/i.test(voice.lang)) ||
        voices[0] ||
        null
    }
    pick()
    window.speechSynthesis.addEventListener('voiceschanged', pick)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick)
  }, [supported])

  useEffect(() => {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    if (muted && supported) window.speechSynthesis.cancel()
  }, [muted, supported])

  const speak = useCallback(
    (text) => {
      if (!supported || muted || !text) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      if (voiceRef.current) utterance.voice = voiceRef.current
      utterance.rate = 0.96
      utterance.pitch = 1
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [muted, supported],
  )

  const cancel = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  useEffect(() => cancel, [cancel])

  return { supported, muted, setMuted, speak, cancel, speaking }
}
