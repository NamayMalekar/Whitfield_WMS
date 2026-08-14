import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Animates a number towards its new value.
 *
 * The dashboard re-polls every fifteen seconds; counting to the new figure
 * shows *that a number moved* without a flash or a jump, which is the thing a
 * supervisor glancing at the wall screen actually needs to notice. Reduced
 * motion snaps straight to the value.
 */
export default function useCountUp(target = 0, duration = 700) {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const frameRef = useRef(null)

  useEffect(() => {
    const from = fromRef.current
    const to = Number(target) || 0

    if (from === to || prefersReducedMotion()) {
      fromRef.current = to
      setValue(to)
      return undefined
    }

    const start = performance.now()
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      // Same settle curve as the CSS transitions.
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(Math.round(from + (to - from) * eased))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])

  return value
}
