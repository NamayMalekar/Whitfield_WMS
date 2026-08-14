import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import useAuditLog from '../hooks/useAuditLog'
import { Banner, EmptyState, Skeleton } from './ui'

const formatTime = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const ENTITY_COLOR = {
  inventory: 'var(--shipped)',
  order: 'var(--cobalt)',
  user: 'var(--reno)',
  script_run: 'var(--packing)',
  assistant: 'var(--received)',
  system: 'var(--slate)',
}

export default function AuditLogTable({ warehouseCode }) {
  const {
    entries,
    total,
    loading,
    error,
    filters,
    updateFilter,
    offset,
    setOffset,
    pageSize,
    refresh,
  } = useAuditLog({ initialFilters: { warehouse_location: warehouseCode || '' } })

  return (
    <section className="card overflow-hidden" aria-label="Audit log">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="display-md">Audit log</h2>
          <p className="lede mt-1">
            Every write, with the person who made it. Entries cannot be edited or removed.
          </p>
        </div>
        <button type="button" onClick={refresh} className="btn-quiet btn-sm">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="grid gap-2 border-t border-line bg-mist px-5 py-4 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate"
            aria-hidden="true"
          />
          <input
            className="field pl-10"
            placeholder="Search action, user or record"
            aria-label="Search the audit log"
            value={filters.search || ''}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
        </div>
        <input
          className="field"
          placeholder="Filter by user"
          aria-label="Filter by user"
          value={filters.username || ''}
          onChange={(event) => updateFilter('username', event.target.value)}
        />
        <select
          className="field"
          aria-label="Filter by record type"
          value={filters.entity_type || ''}
          onChange={(event) => updateFilter('entity_type', event.target.value)}
        >
          <option value="">All record types</option>
          {Object.keys(ENTITY_COLOR).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="px-5 py-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {loading && entries.length === 0 ? (
        <div className="space-y-2 border-t border-line p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState title="No entries match" hint="Clear the filters to see the full trail." />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-mist">
                {['Seq', 'When', 'Who', 'Action', 'Record', 'Building', 'Detail'].map((heading) => (
                  <th key={heading} className="th">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr key={entry.id} className="row align-top">
                  <td className="td data text-slate">{entry.sequence}</td>
                  <td className="td data whitespace-nowrap text-slate">{formatTime(entry.timestamp)}</td>
                  <td className="td">
                    <span className="data text-[0.8125rem] font-medium">{entry.username}</span>
                    <span className="ml-1.5 text-xs text-slate">{entry.role}</span>
                  </td>
                  <td className="td text-[0.8125rem] font-medium">{entry.action}</td>
                  <td className="td">
                    <span
                      className="pill tint"
                      style={{ color: ENTITY_COLOR[entry.entity_type] || 'var(--slate)' }}
                    >
                      {entry.entity_type}
                    </span>
                    {entry.entity_id && (
                      <span
                        className="data ml-1.5 text-xs text-slate"
                        title={entry.entity_id}
                      >
                        {String(entry.entity_id).length > 12
                          ? `${String(entry.entity_id).slice(0, 8)}…`
                          : entry.entity_id}
                      </span>
                    )}
                  </td>
                  <td className="td data text-slate">{entry.warehouse_location || '—'}</td>
                  <td className="td">
                    <span className="data text-xs leading-relaxed text-slate">
                      {Object.entries(entry.details || {})
                        .slice(0, 3)
                        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                        .join('  ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
        <p className="text-xs text-slate">
          <span className="data font-semibold text-ink">{total.toLocaleString()}</span> entries
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-quiet btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Newer
          </button>
          <button
            type="button"
            className="btn-quiet btn-sm"
            disabled={offset + pageSize >= total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Older
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
