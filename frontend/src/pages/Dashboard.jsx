import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, PackageSearch, RefreshCw } from 'lucide-react'
import { inventoryApi } from '../services/api'
import MetricCard from '../components/MetricCard'
import FlowRail from '../components/FlowRail'
import { Banner, EmptyState, PageHeader, Skeleton, SkeletonCard } from '../components/ui'

const REFRESH_MS = 15000

const STAGES = [
  { key: 'RECEIVED', label: 'Received', color: 'var(--received)' },
  { key: 'PULLING', label: 'Pulling', color: 'var(--pulling)' },
  { key: 'PACKING', label: 'Packing', color: 'var(--packing)' },
  { key: 'SHIPPED', label: 'Shipped', color: 'var(--shipped)' },
]

const HOUSE_COLOR = { RENO: 'var(--reno)', COLUMBUS: 'var(--columbus)' }

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(() => {
    setRefreshing(true)
    return inventoryApi
      .dashboard()
      .then(({ data: payload }) => {
        setData(payload)
        setUpdatedAt(new Date())
        setError('')
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  if (loading) return <DashboardSkeleton />
  if (error && !data) return <Banner tone="error">{error}</Banner>
  if (!data) return null

  const totals = data.warehouses.reduce(
    (sum, warehouse) => ({
      available: sum.available + warehouse.units_available,
      open: sum.open + warehouse.open_orders,
      shipped: sum.shipped + warehouse.shipped_today,
      low: sum.low + warehouse.below_reorder,
    }),
    { available: 0, open: 0, shipped: 0, low: 0 },
  )

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow={data.warehouses.map((w) => w.warehouse_name).join(' · ') || 'Floor status'}
        title="Floor status"
        actions={
          <>
            <span className="hidden items-center gap-2 pr-1 text-xs text-slate sm:flex">
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-halo absolute inline-flex h-full w-full rounded-full"
                  style={{ background: 'var(--shipped)' }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: 'var(--shipped)' }}
                />
              </span>
              {updatedAt ? `Read at ${updatedAt.toLocaleTimeString()}` : 'Connecting'}
            </span>
            <button type="button" onClick={load} className="btn-quiet btn-sm">
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </>
        }
      >
        {data.warehouses.length > 1 ? 'Both buildings' : 'Your building'}, refreshed every{' '}
        {REFRESH_MS / 1000} seconds.
      </PageHeader>

      {error && <Banner tone="warning">{error} Showing the last good read.</Banner>}

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Available now"
          value={totals.available}
          unit="units"
          footnote="On hand across both buildings, minus stock already reserved"
        />
        <MetricCard label="Open orders" value={totals.open} tone="cobalt" />
        <MetricCard label="Shipped today" value={totals.shipped} tone="shipped" />
        <MetricCard
          label="Below reorder"
          value={totals.low}
          unit="SKUs"
          tone={totals.low > 0 ? 'alert' : 'shipped'}
          footnote={totals.low > 0 ? 'Raise a PO before the next wave' : 'Everything is above the line'}
        />
      </div>

      <div className={`grid gap-5 ${data.warehouses.length > 1 ? 'xl:grid-cols-2' : ''}`}>
        {data.warehouses.map((warehouse) => (
          <WarehousePanel
            key={warehouse.warehouse_code}
            warehouse={warehouse}
            pipeline={data.pipeline[warehouse.warehouse_code] || {}}
            pulse={updatedAt?.getTime()}
          />
        ))}
      </div>

      <LowStock rows={data.low_stock} />
    </div>
  )
}

function WarehousePanel({ warehouse, pipeline, pulse }) {
  const stages = STAGES.map((stage) => ({ ...stage, count: pipeline[stage.key] || 0 }))
  const accent = HOUSE_COLOR[warehouse.warehouse_code] || 'var(--cobalt)'

  return (
    <section className="card animate-rise overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} aria-hidden="true" />
          <h2 className="display-md">{warehouse.warehouse_name}</h2>
          <span className="pill tint" style={{ color: accent }}>
            {warehouse.warehouse_code}
          </span>
        </div>
        <p className="text-xs text-slate">
          <span className="data font-semibold text-ink">{warehouse.shipped_today}</span>{' '}
          out today
        </p>
      </div>

      <div className="px-5 py-5">
        <FlowRail stages={stages} pulse={pulse} />
      </div>

      <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
        {[
          ['On hand', warehouse.units_on_hand.toLocaleString(), null],
          ['Available', warehouse.units_available.toLocaleString(), null],
          ['Reserved', warehouse.units_reserved.toLocaleString(), 'var(--cobalt)'],
          [
            'Damaged',
            warehouse.units_damaged.toLocaleString(),
            warehouse.units_damaged > 0 ? 'var(--packing)' : null,
          ],
        ].map(([term, value, color], index) => (
          <div
            key={term}
            className={`px-5 py-4 ${index % 2 === 1 ? 'border-l border-line' : ''} ${
              index >= 2 ? 'border-t sm:border-t-0 sm:border-l' : ''
            } border-line`}
          >
            <dt className="eyebrow">{term}</dt>
            <dd className="data mt-1.5 text-lg font-semibold" style={color ? { color } : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function LowStock({ rows }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="display-md">Needs reordering</h2>
          <p className="lede mt-1">SKUs sitting under their reorder point right now.</p>
        </div>
        <Link to="/receiving" className="btn-quiet btn-sm group">
          Log a delivery
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-300 ease-ease group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState
            icon={PackageSearch}
            title="Nothing below the line"
            hint="Both buildings are above their reorder points."
          />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-mist">
                <th className="th">SKU</th>
                <th className="th">Product</th>
                <th className="th">Building</th>
                <th className="th">Available</th>
                <th className="th">Reorder at</th>
                <th className="th">Bin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="row">
                  <td className="td data font-medium">{row.sku}</td>
                  <td className="td">{row.product_name}</td>
                  <td className="td">
                    <span
                      className="pill tint"
                      style={{ color: HOUSE_COLOR[row.warehouse_code] || 'var(--slate)' }}
                    >
                      {row.warehouse_code}
                    </span>
                  </td>
                  <td className="td data font-semibold" style={{ color: 'var(--alert)' }}>
                    {row.available}
                  </td>
                  <td className="td data text-slate">{row.reorder_point}</td>
                  <td className="td data text-slate">{row.bin_location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-9">
      <div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-10 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} lines={1} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  )
}
