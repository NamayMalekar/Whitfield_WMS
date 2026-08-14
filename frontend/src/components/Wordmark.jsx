/**
 * The mark is the dock seen end-on: two pallets stacked on a rail. It is the
 * only place the cobalt appears without being clickable, so it stays small.
 */
export default function Wordmark({ size = 'md' }) {
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const text = size === 'lg' ? 'text-2xl' : 'text-lg'

  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`${box} flex shrink-0 items-center justify-center rounded-[0.75rem]`}
        style={{ background: 'var(--cobalt)' }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none">
          <rect x="4" y="5" width="9" height="6" rx="1.4" fill="var(--cobalt-ink)" opacity="0.55" />
          <rect x="4" y="13" width="16" height="6" rx="1.4" fill="var(--cobalt-ink)" />
        </svg>
      </span>
      <span className={`font-display ${text} font-semibold tracking-[-0.03em]`}>Whitfield</span>
    </div>
  )
}
