import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, Inbox } from 'lucide-react'
import { inventoryApi, newIdempotencyKey } from '../services/api'
import { useWarehouse } from '../context/WarehouseContext'
import VoiceReceivingWidget from '../components/VoiceReceivingWidget'
import { Banner, EmptyState, Field, PageHeader, Skeleton } from '../components/ui'

const emptyForm = {
  sku: '',
  quantity: '',
  damaged_quantity: '0',
  bin_location: '',
  reference: '',
  note: '',
}

const TYPE_COLOR = {
  RECEIPT: 'var(--shipped)',
  ADJUSTMENT: 'var(--packing)',
  TRANSFER_IN: 'var(--cobalt)',
  TRANSFER_OUT: 'var(--cobalt)',
  RESERVE: 'var(--received)',
  RELEASE: 'var(--slate)',
  CONSUME: 'var(--slate)',
}

export default function Receiving() {
  const { active, activeWarehouse } = useWarehouse()
  const [form, setForm] = useState(emptyForm)
  const [products, setProducts] = useState([])
  const [recent, setRecent] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  // Generated once per keyed attempt: resubmitting the same receipt after a
  // freeze reuses this key and cannot double-count.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)

  const loadRecent = useCallback(() => {
    if (!active) return Promise.resolve()
    return inventoryApi
      .transactions({ warehouse_code: active, limit: 12 })
      .then(({ data }) => setRecent(data))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false))
  }, [active])

  useEffect(() => {
    inventoryApi
      .products()
      .then(({ data }) => setProducts(data))
      .catch(() => setProducts([]))
  }, [])

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = (event) => {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    inventoryApi
      .receive({
        sku: form.sku,
        warehouse_code: active,
        quantity: Number(form.quantity),
        damaged_quantity: Number(form.damaged_quantity || 0),
        bin_location: form.bin_location || null,
        reference: form.reference,
        note: form.note,
        source: 'manual',
        idempotency_key: idempotencyKey,
      })
      .then(({ data }) => {
        setFeedback({
          tone: data.duplicate_suppressed ? 'warning' : 'success',
          message: data.message,
        })
        setForm(emptyForm)
        setIdempotencyKey(newIdempotencyKey())
        loadRecent()
      })
      .catch((err) => setFeedback({ tone: 'error', message: err.friendlyMessage }))
      .finally(() => setBusy(false))
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={active || 'No building selected'} title="Receiving">
        {activeWarehouse
          ? `Logging into ${activeWarehouse.name}, ${activeWarehouse.city}. Switch buildings at the top.`
          : 'Pick a building at the top before logging anything.'}
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="display-md">Log by hand</h2>
          <p className="lede mt-1">For when the headset is on charge.</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="SKU" htmlFor="sku">
              <input
                id="sku"
                list="sku-options"
                className="field data"
                value={form.sku}
                onChange={update('sku')}
                placeholder="SKU-1042"
                required
              />
              <datalist id="sku-options">
                {products.map((product) => (
                  <option key={product.id} value={product.sku}>
                    {product.name}
                  </option>
                ))}
              </datalist>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Units received" htmlFor="quantity">
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  className="field data text-lg font-semibold"
                  value={form.quantity}
                  onChange={update('quantity')}
                  required
                />
              </Field>
              <Field label="Of those, damaged" htmlFor="damaged">
                <input
                  id="damaged"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="field data text-lg font-semibold"
                  value={form.damaged_quantity}
                  onChange={update('damaged_quantity')}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Bin" htmlFor="bin">
                <input
                  id="bin"
                  className="field data"
                  value={form.bin_location}
                  onChange={update('bin_location')}
                  placeholder="A12"
                />
              </Field>
              <Field label="PO or reference" htmlFor="reference">
                <input
                  id="reference"
                  className="field data"
                  value={form.reference}
                  onChange={update('reference')}
                  placeholder="PO-88231"
                />
              </Field>
            </div>

            <Field label="Note" htmlFor="note">
              <input
                id="note"
                className="field"
                value={form.note}
                onChange={update('note')}
                placeholder="Shrink wrap torn on two cartons"
              />
            </Field>

            {feedback && <Banner tone={feedback.tone}>{feedback.message}</Banner>}

            <button type="submit" className="btn-primary w-full" disabled={busy || !active}>
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Logging' : 'Log receipt'}
            </button>
            <p className="text-xs leading-relaxed text-slate">
              Safe to retry. This receipt carries a one-time key, so sending it again after a freeze
              will not add the units twice.
            </p>
          </form>
        </section>

        <VoiceReceivingWidget onLogged={loadRecent} products={products} />
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="display-md">Logged at {active}</h2>
          <p className="lede mt-1">The last twelve movements in this building.</p>
        </div>

        {loading ? (
          <div className="space-y-2 border-t border-line p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState
              icon={Inbox}
              title="Nothing logged here yet"
              hint="The first receipt of the shift will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-mist">
                  {['When', 'Type', 'Units', 'Damaged', 'On hand after', 'Source', 'Reference'].map(
                    (heading) => (
                      <th key={heading} className="th">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((row) => (
                  <tr key={row.id} className="row">
                    <td className="td data whitespace-nowrap text-slate">
                      {new Date(row.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="td">
                      <span
                        className="pill tint"
                        style={{ color: TYPE_COLOR[row.type] || 'var(--slate)' }}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="td data font-semibold">{row.quantity}</td>
                    <td
                      className="td data"
                      style={row.damaged_quantity ? { color: 'var(--packing)' } : undefined}
                    >
                      {row.damaged_quantity}
                    </td>
                    <td className="td data">{row.resulting_on_hand}</td>
                    <td className="td">
                      <span className="text-[0.8125rem] text-slate">{row.source}</span>
                    </td>
                    <td className="td data text-slate">{row.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
