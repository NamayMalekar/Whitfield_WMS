import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Plus, Scale, Trash2 } from 'lucide-react'
import { inventoryApi, orderApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWarehouse } from '../context/WarehouseContext'
import { Banner, Field, Modal, PageHeader, Skeleton, StatusPill } from '../components/ui'

const FLOW = ['RECEIVED', 'PULLING', 'PACKING', 'SHIPPED']
const NEXT = { RECEIVED: 'PULLING', PULLING: 'PACKING', PACKING: 'SHIPPED' }

const COLUMN = {
  RECEIVED: {
    label: 'Received',
    color: 'var(--received)',
    copy: 'Confirmed and reserved. Waiting on a picker.',
  },
  PULLING: {
    label: 'Pulling',
    color: 'var(--pulling)',
    copy: 'Being pulled from the pick face.',
  },
  PACKING: {
    label: 'Packing',
    color: 'var(--packing)',
    copy: 'Boxed. Needs weight and dimensions.',
  },
  SHIPPED: {
    label: 'Shipped',
    color: 'var(--shipped)',
    copy: 'Out the door today.',
  },
}

export default function Fulfillment() {
  const { active } = useWarehouse()
  const { can } = useAuth()
  const [board, setBoard] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [packOutOrder, setPackOutOrder] = useState(null)
  const [creating, setCreating] = useState(false)
  const [dragOver, setDragOver] = useState(null)

  const load = useCallback(() => {
    if (!active) return Promise.resolve()
    return Promise.all([
      orderApi.board(active),
      orderApi.list({ warehouse_code: active, status: 'DRAFT' }),
    ])
      .then(([boardResponse, draftResponse]) => {
        setBoard(boardResponse.data)
        setDrafts(draftResponse.data)
      })
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
      .finally(() => setLoading(false))
  }, [active])

  useEffect(() => {
    load()
    const timer = setInterval(load, 20000)
    return () => clearInterval(timer)
  }, [load])

  const advance = (order, status) => {
    if (status === 'SHIPPED' && order.package_weight_kg == null) {
      setPackOutOrder(order)
      setMessage({
        tone: 'warning',
        message: `${order.order_number} needs a weight and dimensions before it can ship.`,
      })
      return
    }
    orderApi
      .setStatus(order.id, status)
      .then(({ data }) => {
        setMessage({
          tone: 'success',
          message: `${data.order_number} moved to ${COLUMN[data.status]?.label || data.status}.`,
        })
        load()
      })
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
  }

  const confirmDraft = (order) => {
    orderApi
      .confirm(order.id)
      .then(({ data }) => {
        setMessage({
          tone: 'success',
          message: `${data.order_number} confirmed. Stock is reserved and cannot be sold twice.`,
        })
        load()
      })
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
  }

  const cancel = (order) => {
    orderApi
      .cancel(order.id)
      .then(({ data }) => {
        setMessage({ tone: 'success', message: `${data.order_number} cancelled, stock released.` })
        load()
      })
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
  }

  if (loading) return <BoardSkeleton />

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={active}
        title="Fulfillment"
        actions={
          can('order:create') && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New order
            </button>
          )
        }
      >
        Drag a card to the next column, or use the button on the card. Shipping stays blocked until
        weight and dimensions are captured.
      </PageHeader>

      {message && (
        <Banner tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.message}
        </Banner>
      )}

      {drafts.length > 0 && (
        <section className="card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="display-md">Waiting on confirmation</h2>
            <p className="lede mt-1">Stock is not reserved until an order is confirmed.</p>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {drafts.map((order) => (
              <li key={order.id} className="row flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="data text-sm font-semibold">{order.order_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{order.customer_name}</span>
                <span className="data text-xs text-slate">
                  {order.items.map((item) => `${item.sku}×${item.quantity}`).join(', ')}
                </span>
                {can('order:confirm') && (
                  <button type="button" className="btn-quiet btn-sm" onClick={() => confirmDraft(order)}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Confirm
                  </button>
                )}
                {can('order:cancel') && (
                  <button type="button" className="btn-danger btn-sm" onClick={() => cancel(order)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {FLOW.map((column) => {
          const orders = board?.columns?.[column] || []
          const meta = COLUMN[column]
          const isTarget = dragOver === column

          return (
            <section
              key={column}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(column)
              }}
              onDragLeave={() => setDragOver((current) => (current === column ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(null)
                const payload = event.dataTransfer.getData('application/json')
                if (!payload) return
                const order = JSON.parse(payload)
                if (order.status !== column) advance(order, column)
              }}
              className="flex flex-col rounded-2xl border bg-paper transition duration-200 ease-ease"
              style={{
                borderColor: isTarget ? meta.color : 'var(--line)',
                background: isTarget ? 'color-mix(in srgb, var(--mist) 70%, var(--paper))' : undefined,
                boxShadow: isTarget ? `0 0 0 3px color-mix(in srgb, ${meta.color} 18%, transparent)` : undefined,
              }}
            >
              <div className="px-4 pb-3 pt-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                  <h2 className="text-[0.9375rem] font-semibold">{meta.label}</h2>
                  <span className="data ml-auto text-sm text-slate">{orders.length}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate">{meta.copy}</p>
              </div>

              <div className="flex-1 space-y-2 px-3 pb-3">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    column={column}
                    canAdvance={can('order:advance')}
                    onAdvance={() => advance(order, NEXT[column])}
                    onPackOut={() => setPackOutOrder(order)}
                  />
                ))}
                {orders.length === 0 && (
                  <p className="py-8 text-center text-xs text-slate">Nothing here.</p>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <PackOutModal
        order={packOutOrder}
        onClose={() => setPackOutOrder(null)}
        onSaved={(order) => {
          setPackOutOrder(null)
          setMessage({ tone: 'success', message: `Measurements saved for ${order.order_number}.` })
          load()
        }}
        onError={(error) => setMessage({ tone: 'error', message: error })}
      />

      <NewOrderModal
        open={creating}
        warehouseCode={active}
        onClose={() => setCreating(false)}
        onCreated={(order) => {
          setCreating(false)
          setMessage({
            tone: 'success',
            message: `${order.order_number} created. Confirm it to reserve stock.`,
          })
          load()
        }}
      />
    </div>
  )
}

function OrderCard({ order, column, canAdvance, onAdvance, onPackOut }) {
  const [dragging, setDragging] = useState(false)
  const needsMeasuring = order.package_weight_kg == null
  const priority =
    order.priority === 'rush'
      ? { label: 'Rush', color: 'var(--packing)' }
      : order.priority === 'hazmat'
        ? { label: 'Hazmat', color: 'var(--alert)' }
        : null

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/json', JSON.stringify(order))
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      className={`cursor-grab rounded-xl border border-line bg-mist p-3 transition duration-200 ease-ease
        active:cursor-grabbing ${dragging ? 'scale-[0.98] opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="data text-[0.8125rem] font-semibold">{order.order_number}</span>
        {priority && (
          <span className="pill tint" style={{ color: priority.color }}>
            {priority.label}
          </span>
        )}
      </div>

      <p className="mt-1.5 truncate text-sm font-medium">{order.customer_name}</p>
      <p className="data mt-0.5 truncate text-xs text-slate">
        {order.items.map((item) => `${item.sku}×${item.quantity}`).join(', ')}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="data text-xs text-slate">{order.age_hours}h old</span>
        <StatusPill status={order.status} />
      </div>

      {NEXT[column] && canAdvance && (
        <button type="button" className="btn-quiet btn-sm group mt-3 w-full" onClick={onAdvance}>
          {COLUMN[NEXT[column]].label}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-300 ease-ease group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      )}

      {column === 'PACKING' && (
        <button
          type="button"
          className="btn-bare btn-sm mt-1.5 w-full"
          onClick={onPackOut}
          style={needsMeasuring ? { color: 'var(--packing)' } : undefined}
        >
          <Scale className="h-3.5 w-3.5" aria-hidden="true" />
          {needsMeasuring ? 'Weigh and measure' : 'Update measurements'}
        </button>
      )}
    </article>
  )
}

function PackOutModal({ order, onClose, onSaved, onError }) {
  const [values, setValues] = useState({ weight: '', length: '', width: '', height: '', tracking: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!order) return
    setValues({
      weight: order.package_weight_kg ?? '',
      length: order.package_length_cm ?? '',
      width: order.package_width_cm ?? '',
      height: order.package_height_cm ?? '',
      tracking: order.tracking_number ?? '',
    })
  }, [order])

  if (!order) return null

  const save = () => {
    setBusy(true)
    orderApi
      .packOut(order.id, {
        package_weight_kg: Number(values.weight),
        package_length_cm: Number(values.length),
        package_width_cm: Number(values.width),
        package_height_cm: Number(values.height),
        tracking_number: values.tracking || null,
      })
      .then(({ data }) => onSaved(data))
      .catch((error) => onError(error.friendlyMessage))
      .finally(() => setBusy(false))
  }

  return (
    <Modal
      open
      title={`Pack out ${order.order_number}`}
      description="Carriers reject labels without these. Capturing them here is what lets the order ship today instead of tomorrow."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving' : 'Save measurements'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {[
          ['weight', 'Weight (kg)'],
          ['length', 'Length (cm)'],
          ['width', 'Width (cm)'],
          ['height', 'Height (cm)'],
        ].map(([key, label]) => (
          <Field key={key} label={label} htmlFor={key}>
            <input
              id={key}
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              className="field data text-lg font-semibold"
              value={values[key]}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            />
          </Field>
        ))}
      </div>
      <Field label="Tracking number" htmlFor="tracking">
        <input
          id="tracking"
          className="field data"
          value={values.tracking}
          onChange={(event) => setValues((current) => ({ ...current, tracking: event.target.value }))}
        />
      </Field>
    </Modal>
  )
}

function NewOrderModal({ open, warehouseCode, onClose, onCreated }) {
  const [customer, setCustomer] = useState('')
  const [destination, setDestination] = useState('')
  const [priority, setPriority] = useState('standard')
  const [lines, setLines] = useState([{ sku: '', quantity: 1 }])
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    inventoryApi
      .products()
      .then(({ data }) => setProducts(data))
      .catch(() => setProducts([]))
  }, [open])

  if (!open) return null

  const submit = () => {
    setBusy(true)
    setError('')
    orderApi
      .create({
        customer_name: customer,
        destination,
        warehouse_code: warehouseCode,
        priority,
        items: lines
          .filter((line) => line.sku && Number(line.quantity) > 0)
          .map((line) => ({ sku: line.sku, quantity: Number(line.quantity) })),
      })
      .then(({ data }) => {
        setCustomer('')
        setDestination('')
        setLines([{ sku: '', quantity: 1 }])
        onCreated(data)
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => setBusy(false))
  }

  return (
    <Modal
      open
      wide
      title="New order"
      description="Created as a draft. Confirming it is what reserves the stock."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !customer}>
            {busy ? 'Creating' : 'Create order'}
          </button>
        </>
      }
    >
      {error && <Banner tone="error">{error}</Banner>}

      <Field label="Customer" htmlFor="customer">
        <input
          id="customer"
          className="field"
          value={customer}
          onChange={(event) => setCustomer(event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Destination" htmlFor="destination">
          <input
            id="destination"
            className="field"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Sacramento, CA"
          />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <select
            id="priority"
            className="field"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="rush">Rush</option>
            <option value="hazmat">Hazmat</option>
          </select>
        </Field>
      </div>

      <div>
        <p className="label">Lines</p>
        <div className="mt-1.5 space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="flex gap-2">
              <select
                className="field"
                aria-label={`SKU for line ${index + 1}`}
                value={line.sku}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item, i) => (i === index ? { ...item, sku: event.target.value } : item)),
                  )
                }
              >
                <option value="">Pick a SKU</option>
                {products.map((product) => (
                  <option key={product.id} value={product.sku}>
                    {product.sku} — {product.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                aria-label={`Quantity for line ${index + 1}`}
                className="field data w-24 text-center"
                value={line.quantity}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, quantity: event.target.value } : item,
                    ),
                  )
                }
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  className="icon-btn border border-line"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-bare btn-sm mt-2"
          onClick={() => setLines((current) => [...current, { sku: '', quantity: 1 }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add line
        </button>
      </div>
    </Modal>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-7">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-10 w-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card space-y-2 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
