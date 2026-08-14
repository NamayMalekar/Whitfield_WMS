import { useEffect, useRef } from 'react'
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react'

/* Small, shared parts. Everything here is presentational: no data fetching,
   no router, so a page can compose them without surprises. */

export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center gap-2 text-slate ${className}`} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

/** Loading placeholders that hold the shape of what is coming. */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card p-5" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className={`h-3 ${index % 2 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  )
}

const BANNER_TONES = {
  info: { color: 'var(--cobalt)', Icon: Info },
  success: { color: 'var(--shipped)', Icon: Check },
  warning: { color: 'var(--packing)', Icon: AlertTriangle },
  error: { color: 'var(--alert)', Icon: AlertTriangle },
}

export function Banner({ tone = 'info', children, onDismiss, className = '' }) {
  const { color, Icon } = BANNER_TONES[tone] || BANNER_TONES.info
  return (
    <div
      className={`animate-scale-in flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${className}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, var(--paper))`,
      }}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 whitespace-pre-line text-ink">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded-lg p-1 text-slate transition hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function Modal({ open, title, description, onClose, children, footer, wide = false }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade absolute inset-0 cursor-default"
        style={{ background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border
          border-line bg-paper p-6 shadow-lift outline-none sm:rounded-3xl
          ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="display-md">{title}</h2>
            {description && <p className="lede mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn -mr-2 -mt-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, hint, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-mist text-slate">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="display-md">{title}</p>
      {hint && <p className="lede max-w-sm">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

const STATUS_COLOR = {
  DRAFT: 'var(--slate)',
  RECEIVED: 'var(--received)',
  PULLING: 'var(--pulling)',
  PACKING: 'var(--packing)',
  SHIPPED: 'var(--shipped)',
  CANCELLED: 'var(--alert)',
}

const STATUS_COPY = {
  DRAFT: 'Draft',
  RECEIVED: 'Received',
  PULLING: 'Pulling',
  PACKING: 'Packing',
  SHIPPED: 'Shipped',
  CANCELLED: 'Cancelled',
}

export function StatusPill({ status }) {
  return (
    <span className="pill tint" style={{ color: STATUS_COLOR[status] || 'var(--slate)' }}>
      {STATUS_COPY[status] || status}
    </span>
  )
}

const ROLE_COPY = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  VETERAN: 'Veteran',
  NEWHIRE: 'New hire',
}

const ROLE_COLOR = {
  SUPERADMIN: 'var(--alert)',
  ADMIN: 'var(--cobalt)',
  MANAGER: 'var(--packing)',
  VETERAN: 'var(--shipped)',
  NEWHIRE: 'var(--slate)',
}

export function RoleBadge({ role }) {
  const copy = ROLE_COPY
  const color = ROLE_COLOR[role] || 'var(--slate)'
  return (
    <span className="pill tint" style={{ color }} title={`Access level: ${copy[role] || role}`}>
      {copy[role] || role}
    </span>
  )
}

/** iOS-style segmented control with a pill that slides between options. */
export function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex rounded-xl bg-mist p-1 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 rounded-lg bg-paper shadow-soft transition-transform duration-300 ease-ease"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(calc(${index} * 100%))`,
          left: '0.25rem',
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[0.8125rem]
            font-semibold transition-colors duration-200
            ${option.value === value ? 'text-ink' : 'text-slate hover:text-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Label + control + optional hint, so forms line up without repeating markup. */
export function Field({ label, hint, htmlFor, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-slate">{hint}</p>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display-xl">{title}</h1>
        {children && <p className="lede mt-2 max-w-2xl">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
