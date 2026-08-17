import { useEffect, useState } from "react";
import { Plus, Loader2, Clock, X as XIcon, Package2 } from "lucide-react";
import { orderApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useWarehouse } from "../context/WarehouseContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";

const COLUMNS = [
  { key: "RECEIVED", label: "Received", tone: "ink" },
  { key: "PULLING", label: "Pulling", tone: "warn" },
  { key: "PACKING", label: "Packing", tone: "accent" },
  { key: "SHIPPED", label: "Shipped", tone: "good" },
];

const NEXT_STATUS = { DRAFT: "RECEIVED", RECEIVED: "PULLING", PULLING: "PACKING", PACKING: "SHIPPED" };

export default function Orders() {
  const { warehouses, active } = useWarehouse();
  const toast = useToast();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [packOutOrder, setPackOutOrder] = useState(null);
  const effectiveWh = active !== "all" ? active : warehouses[0]?.code;

  function load() {
    if (!effectiveWh) return;
    orderApi
      .board({ warehouse_code: effectiveWh })
      .then((res) => setBoard(res.data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load the board.")));
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveWh]);

  async function advance(order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    
    // If transitioning to SHIPPED, show pack-out form first
    if (next === "SHIPPED") {
      setPackOutOrder(order);
      return;
    }
    
    setBusyId(order.id);
    try {
      if (order.status === "DRAFT") {
        // Confirm the order first (moves to RECEIVED)
        await orderApi.confirm(order.id);
        // If we need to move beyond RECEIVED, do that now
        if (next !== "RECEIVED") {
          await orderApi.changeStatus(order.id, { status: next, note: "" });
        }
      } else {
        // Already confirmed, just change status
        await orderApi.changeStatus(order.id, { status: next, note: "" });
      }
      toast.success(`Moved to ${next}.`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't move that order."));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePackOut(orderId, measurements) {
    setBusyId(orderId);
    try {
      await orderApi.packOut(orderId, measurements);
      toast.success("Package dimensions captured.");
      // Now move to SHIPPED
      await orderApi.changeStatus(orderId, { status: "SHIPPED", note: "" });
      toast.success("Moved to SHIPPED.");
      setPackOutOrder(null);
      if (detail?.id === orderId) {
        setDetail(null);
      }
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't ship this order."));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(order) {
    setBusyId(order.id);
    try {
      await orderApi.cancel(order.id);
      toast.success("Order cancelled.");
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't cancel that order."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Fulfillment</span>
          <h1 className="page-title">Order pipeline</h1>
          <p className="page-sub">Received → Pulling → Packing → Shipped. Drag through the stages as work happens on the floor.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New order
        </button>
      </div>

      {error && <div className="empty card card-pad">{error}</div>}
      {!board && !error && <div className="skeleton" style={{ height: 500, borderRadius: 20 }} />}

      {board && (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const orders = board.columns?.[col.key] || [];
            return (
              <div className="kanban-col" key={col.key}>
                <div className="kanban-col-head">
                  <span className={`kcol-dot tone-${col.tone}`} />
                  <span className="kcol-label">{col.label}</span>
                  <span className="kcol-count">{orders.length}</span>
                </div>
                <div className="kanban-col-body">
                  {orders.length === 0 && <div className="kcol-empty">No orders here</div>}
                  {orders.map((o) => (
                    <button className="kcard fade-in" key={o.id} onClick={() => setDetail(o)}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <span className="kcard-num mono">{o.order_number}</span>
                        {o.priority !== "standard" && (
                          <span className={`badge ${o.priority === "hazmat" ? "badge-hazmat" : "badge-warn"}`} style={{ fontSize: 10.5, padding: "2px 8px" }}>
                            {o.priority}
                          </span>
                        )}
                      </div>
                      <div className="kcard-customer">{o.customer_name}</div>
                      <div className="kcard-meta">
                        <span><Package2 size={11} /> {o.items?.length || 0} SKU{(o.items?.length || 0) === 1 ? "" : "s"}</span>
                        <span><Clock size={11} /> {o.age_hours < 1 ? "<1h" : `${Math.round(o.age_hours)}h`}</span>
                      </div>
                      {col.key !== "SHIPPED" && (
                        <div className="kcard-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ flex: 1 }}
                            disabled={busyId === o.id}
                            onClick={() => advance(o)}
                          >
                            {busyId === o.id ? <Loader2 size={13} className="spin" /> : `Move to ${NEXT_STATUS[o.status]}`}
                          </button>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateOrderModal
          warehouses={warehouses}
          defaultWh={effectiveWh}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(); }}
          toast={toast}
        />
      )}

      {detail && (
        <OrderDetailModal
          order={detail}
          onClose={() => setDetail(null)}
          onCancel={() => { cancel(detail); setDetail(null); }}
          onAdvance={() => { advance(detail); setDetail(null); }}
        />
      )}

      {packOutOrder && (
        <PackOutModal
          order={packOutOrder}
          onClose={() => setPackOutOrder(null)}
          onSubmit={(measurements) => { handlePackOut(packOutOrder.id, measurements); setPackOutOrder(null); }}
          busy={busyId === packOutOrder.id}
        />
      )}

      <style>{`
        .kanban {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          align-items: start;
        }
        .kanban-col {
          background: #f3f3f5;
          border-radius: var(--r-lg);
          padding: 14px;
          min-height: 200px;
        }
        .kanban-col-head {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 6px 14px;
        }
        .kcol-dot { width: 8px; height: 8px; border-radius: 50%; }
        .tone-ink { background: #8e8e93; }
        .tone-warn { background: var(--c-warn); }
        .tone-accent { background: var(--c-accent); }
        .tone-good { background: var(--c-good); }
        .kcol-label { font-weight: 600; font-size: 13.5px; }
        .kcol-count {
          margin-left: auto;
          background: #fff; border-radius: 999px;
          font-size: 11px; font-weight: 700; color: var(--c-ink-faint);
          padding: 1px 8px;
        }
        .kanban-col-body { display: flex; flex-direction: column; gap: 10px; }
        .kcol-empty {
          text-align: center; font-size: 12px; color: var(--c-ink-faint);
          padding: 24px 0;
        }
        .kcard {
          display: block; width: 100%; text-align: left;
          background: #fff;
          border: 1px solid var(--c-border-soft);
          border-radius: 14px;
          padding: 13px 14px;
          transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
        }
        .kcard:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .kcard-num { font-size: 12px; color: var(--c-ink-faint); }
        .kcard-customer { font-weight: 600; font-size: 14px; margin: 5px 0 8px; }
        .kcard-meta { display: flex; gap: 12px; font-size: 11.5px; color: var(--c-ink-faint); }
        .kcard-meta span { display: inline-flex; align-items: center; gap: 4px; }
        .kcard-actions { margin-top: 10px; }

        @media (max-width: 1100px) {
          .kanban { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .kanban { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function CreateOrderModal({ warehouses, defaultWh, onClose, onDone, toast }) {
  const [customer, setCustomer] = useState("");
  const [destination, setDestination] = useState("");
  const [wh, setWh] = useState(defaultWh || "");
  const [priority, setPriority] = useState("standard");
  const [items, setItems] = useState([{ sku: "", quantity: 1 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await orderApi.create({
        customer_name: customer,
        destination,
        warehouse_code: wh,
        priority,
        items: items.filter((it) => it.sku.trim()).map((it) => ({ sku: it.sku.trim(), quantity: Number(it.quantity) })),
      });
      toast.success("Order created.");
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create that order."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New order" onClose={onClose} width={560}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {error && <div style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 13px", borderRadius: 10, fontSize: 13 }}>{error}</div>}
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow">
            <label>Customer</label>
            <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} required />
          </div>
          <div className="field grow">
            <label>Priority</label>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="standard">Standard</option>
              <option value="rush">Rush</option>
              <option value="hazmat">Hazmat</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Destination <span className="muted">(optional)</span></label>
          <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div className="field">
          <label>Warehouse</label>
          <select className="select" value={wh} onChange={(e) => setWh(e.target.value)} required>
            <option value="">Select…</option>
            {warehouses.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Items</label>
          <div className="stack" style={{ gap: 8 }}>
            {items.map((it, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <input className="input" placeholder="SKU" value={it.sku} onChange={(e) => updateItem(i, { sku: e.target.value })} />
                <input className="input" type="number" min="1" style={{ width: 90 }} value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
                {items.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={() => setItems([...items, { sku: "", quantity: 1 }])}>
            <Plus size={13} /> Add item
          </button>
        </div>

        <button className="btn btn-accent" type="submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : "Create order"}
        </button>
      </form>
    </Modal>
  );
}

function OrderDetailModal({ order, onClose, onCancel, onAdvance }) {
  return (
    <Modal title={order.order_number} onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{order.customer_name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{order.destination || "No destination on file"}</div>
          </div>
          <span className="badge badge-neutral" style={{ textTransform: "capitalize" }}>{order.status}</span>
        </div>

        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Picked</th></tr></thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td className="mono">{it.sku}</td>
                  <td>{it.product_name}</td>
                  <td className="mono">{it.quantity}</td>
                  <td className="mono muted">{it.picked_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {order.tracking_number && (
          <div className="muted" style={{ fontSize: 12.5 }}>Tracking: <span className="mono">{order.tracking_number}</span></div>
        )}

        <div className="row" style={{ gap: 10 }}>
          {order.status !== "SHIPPED" && (
            <button className="btn btn-accent" style={{ flex: 1 }} onClick={onAdvance}>
              Advance stage
            </button>
          )}
          {order.status !== "SHIPPED" && (
            <button className="btn btn-danger" onClick={onCancel}>Cancel order</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PackOutModal({ order, onClose, onSubmit, busy }) {
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [tracking, setTracking] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!weight || !length || !width || !height) {
      alert("Please fill in all dimensions");
      return;
    }
    onSubmit({
      package_weight_kg: parseFloat(weight),
      package_length_cm: parseFloat(length),
      package_width_cm: parseFloat(width),
      package_height_cm: parseFloat(height),
      tracking_number: tracking || null,
    });
  }

  return (
    <Modal title="Capture Package Dimensions" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13.5, color: "var(--c-ink-faint)" }}>
          Order {order.order_number} is ready to ship. Please capture the package dimensions.
        </div>

        <div className="field">
          <label htmlFor="weight">Weight (kg) *</label>
          <input
            id="weight"
            type="number"
            step="0.1"
            min="0"
            className="input"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g. 2.5"
            required
          />
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="length">Length (cm) *</label>
            <input
              id="length"
              type="number"
              step="0.1"
              min="0"
              className="input"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="e.g. 30"
              required
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="width">Width (cm) *</label>
            <input
              id="width"
              type="number"
              step="0.1"
              min="0"
              className="input"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="e.g. 20"
              required
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="height">Height (cm) *</label>
            <input
              id="height"
              type="number"
              step="0.1"
              min="0"
              className="input"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 10"
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tracking">Tracking Number (optional)</label>
          <input
            id="tracking"
            type="text"
            className="input"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
          />
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-accent"
            disabled={busy}
            style={{ flex: 1 }}
          >
            {busy ? <Loader2 size={13} className="spin" style={{ marginRight: 6 }} /> : null}
            Ship Order
          </button>
        </div>
      </form>
    </Modal>
  );
}
