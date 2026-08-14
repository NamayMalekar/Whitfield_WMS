import { useEffect, useRef, useState } from 'react'
import useCountUp from '../hooks/useCountUp'

/**
 * The flow rail.
 *
 * An order in this building only ever travels one way: received, pulling,
 * packing, shipped. So the pipeline is drawn as the thing it is - one rail,
 * divided in proportion to how many orders are standing at each stage. A wide
 * amber band means the pack bench is the constraint this hour, and that reads
 * from the far end of the office without anyone parsing a legend.
 *
 * `pulse` is any value that changes when fresh numbers land; a light runs the
 * length of the rail so a passing glance catches that the screen is live.
 */
export default function FlowRail({ stages, pulse }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0)
  const [travelling, setTravelling] = useState(false)
  const firstRun = useRef(true)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return undefined
    }
    setTravelling(true)
    const timer = setTimeout(() => setTravelling(false), 1500)
    return () => clearTimeout(timer)
  }, [pulse])

  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-mist">
        <div className="flex h-full w-full">
          {stages.map((stage, index) => (
            <div
              key={stage.key}
              className="h-full transition-all duration-700 ease-ease"
              style={{
                width: total ? `${(stage.count / total) * 100}%` : index === 0 ? '100%' : '0%',
                background: total ? stage.color : 'transparent',
                opacity: stage.count ? 1 : 0,
              }}
              title={`${stage.label}: ${stage.count}`}
            />
          ))}
        </div>
        {travelling && (
          <span
            aria-hidden="true"
            className="animate-travel pointer-events-none absolute inset-y-0 left-0 w-1/4"
            style={{
              background:
                'linear-gradient(90deg, transparent, color-mix(in srgb, var(--paper) 85%, transparent), transparent)',
            }}
          />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.map((stage) => (
          <Stage key={stage.key} stage={stage} total={total} />
        ))}
      </div>
    </div>
  )
}

function Stage({ stage, total }) {
  const count = useCountUp(stage.count)
  const share = total ? Math.round((stage.count / total) * 100) : 0

  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full transition-transform duration-300 ease-ease group-hover:scale-150"
          style={{ background: stage.color }}
          aria-hidden="true"
        />
        <span className="text-[0.8125rem] font-medium text-slate">{stage.label}</span>
      </div>
      <p className="data mt-1 pl-4 text-xl font-semibold">
        {count}
        <span className="ml-1.5 font-sans text-[0.6875rem] font-medium text-slate">{share}%</span>
      </p>
    </div>
  )
}
