import useCountUp from '../hooks/useCountUp'

const TONE = {
  ink: 'var(--ink)',
  alert: 'var(--alert)',
  shipped: 'var(--shipped)',
  packing: 'var(--packing)',
  cobalt: 'var(--cobalt)',
}

/**
 * One number, said once. The figure counts to its new value on each poll so a
 * change is visible from across the room; everything else stays still.
 */
export default function MetricCard({ label, value, unit, footnote, tone = 'ink', animate = true }) {
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''))
  const counted = useCountUp(Number.isFinite(numeric) && animate ? numeric : 0)
  const display = Number.isFinite(numeric) && animate ? counted.toLocaleString() : value

  return (
    <div className="card card-hover group p-5">
      <p className="eyebrow">{label}</p>
      <p
        className="data mt-3 text-[2rem] font-semibold leading-none transition-colors"
        style={{ color: TONE[tone] || TONE.ink }}
      >
        {display}
        {unit && <span className="ml-1.5 font-sans text-xs font-medium text-slate">{unit}</span>}
      </p>
      {footnote && <p className="mt-3 text-xs leading-snug text-slate">{footnote}</p>}
    </div>
  )
}
