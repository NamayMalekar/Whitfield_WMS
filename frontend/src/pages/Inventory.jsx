import { useEffect, useMemo, useState } from "react";
import { Search, PackagePlus, SlidersHorizontal, ArrowLeftRight, Plus, Loader2 } from "lucide-react";
import { inventoryApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useWarehouse } from "../context/WarehouseContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function Inventory() {
  const { warehouses, active } = useWarehouse();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // 'receive' | 'adjust' | 'transfer' | 'product'
  const [selected, setSelected] = useState(null);

  function load() {
    const params = {};
    if (active !== "all") params.warehouse_code = active;
    if (debouncedQuery) params.q = debouncedQuery;
    inventoryApi
      .list(params)
      .then((res) => setRows(res.data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load inventory.")));
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [active, debouncedQuery]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return rows.reduce(
      (acc, r) => ({
        onHand: acc.onHand + r.on_hand,
        available: acc.available + r.available,
        reserved: acc.reserved + r.reserved,
        damaged: acc.damaged + r.damaged,
      }),
      { onHand: 0, available: 0, reserved: 0, damaged: 0 }
    );
  }, [rows]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Inventory</span>
          <h1 className="page-title">Stock on hand</h1>
          <p className="page-sub">Live counts, reserved-for-orders, and damage — per SKU, per warehouse.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setModal("transfer")}>
            <ArrowLeftRight size={15} /> Transfer
          </button>
          <button className="btn btn-ghost" onClick={() => setModal("adjust")}>
            <SlidersHorizontal size={15} /> Adjust
          </button>
          <button className="btn btn-primary" onClick={() => setModal("receive")}>
            <PackagePlus size={15} /> Receive stock
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 18 }}>
        <div className="search-box">
          <Search size={15} />
          <input
            className="search-input"
            placeholder="Search SKU or product name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {totals && (
          <div className="inv-mini-totals">
            <span><strong>{totals.onHand.toLocaleString()}</strong> on hand</span>
            <span><strong>{totals.available.toLocaleString()}</strong> available</span>
            <span><strong>{totals.reserved.toLocaleString()}</strong> reserved</span>
            {totals.damaged > 0 && <span className="warn"><strong>{totals.damaged.toLocaleString()}</strong> damaged</span>}
          </div>
        )}
      </div>

      {error && <div className="empty card card-pad">{error}</div>}

      {!rows && !error && <div className="skeleton" style={{ height: 400, borderRadius: 20 }} />}

      {rows && rows.length === 0 && (
        <div className="empty card card-pad">
          <h4>No stock matches this view</h4>
          <p>Try clearing the search, switching warehouses, or receive your first shipment.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>SKU</th><th>Product</th><th>Warehouse</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Damaged</th><th>Bin</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.sku}</td>
                  <td>{r.product_name}</td>
                  <td>
                    <span className={`badge ${r.warehouse_code === "RNO" || r.warehouse_code.toLowerCase().includes("ren") ? "badge-reno" : "badge-columbus"}`}>{r.warehouse_code}</span>
                  </td>
                  <td className="mono">{r.on_hand}</td>
                  <td className="mono muted">{r.reserved}</td>
                  <td className="mono">{r.available}</td>
                  <td className="mono muted">{r.damaged || "—"}</td>
                  <td className="mono muted">{r.bin_location || "—"}</td>
                  <td>
                    {r.below_reorder_point ? (
                      <span className="badge badge-warn">Reorder</span>
                    ) : (
                      <span className="badge badge-good">Healthy</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === "receive" && (
        <ReceiveModal warehouses={warehouses} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} toast={toast} />
      )}
      {modal === "adjust" && (
        <AdjustModal warehouses={warehouses} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} toast={toast} />
      )}
      {modal === "transfer" && (
        <TransferModal warehouses={warehouses} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} toast={toast} />
      )}

      <style>{`
        .search-box {
          display: flex; align-items: center; gap: 8px;
          background: var(--c-surface);
          border: 1px solid var(--c-border);
          border-radius: var(--r-pill);
          padding: 9px 16px;
          color: var(--c-ink-faint);
          flex: 1;
          max-width: 380px;
        }
        .search-input { border: none; outline: none; flex: 1; font-size: 13.5px; background: transparent; }
        .inv-mini-totals {
          display: flex; gap: 18px;
          font-size: 12.5px; color: var(--c-ink-faint);
          align-items: center;
        }
        .inv-mini-totals strong { color: var(--c-ink); font-weight: 700; }
        .inv-mini-totals .warn strong { color: var(--c-warn); }
      `}</style>
    </div>
  );
}

function WarehouseSelect({ value, onChange, warehouses, label = "Warehouse" }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Select warehouse…</option>
        {warehouses.map((w) => (
          <option key={w.code} value={w.code}>{w.name} — {w.city}, {w.state}</option>
        ))}
      </select>
    </div>
  );
}

function ReceiveModal({ warehouses, onClose, onDone, toast }) {
  const [form, setForm] = useState({ sku: "", warehouse_code: "", quantity: "", damaged_quantity: "0", bin_location: "", reference: "", note: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await inventoryApi.receive({
        sku: form.sku.trim(),
        warehouse_code: form.warehouse_code,
        quantity: Number(form.quantity),
        damaged_quantity: Number(form.damaged_quantity || 0),
        bin_location: form.bin_location || undefined,
        reference: form.reference,
        note: form.note,
        source: "manual",
      });
      toast.success(res.data.message || "Stock received.");
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't receive that stock."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Receive stock" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {error && <div className="lf-error" style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 13px", borderRadius: 10, fontSize: 13 }}>{error}</div>}
        <div className="field">
          <label>SKU</label>
          <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-1042" required />
        </div>
        <WarehouseSelect value={form.warehouse_code} onChange={(v) => setForm({ ...form, warehouse_code: v })} warehouses={warehouses} />
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow">
            <label>Quantity</label>
            <input className="input" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </div>
          <div className="field grow">
            <label>Damaged</label>
            <input className="input" type="number" min="0" value={form.damaged_quantity} onChange={(e) => setForm({ ...form, damaged_quantity: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Bin location <span className="muted">(optional)</span></label>
          <input className="input" value={form.bin_location} onChange={(e) => setForm({ ...form, bin_location: e.target.value })} placeholder="A-12-3" />
        </div>
        <div className="field">
          <label>Reference <span className="muted">(optional)</span></label>
          <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="PO-4471" />
        </div>
        <button className="btn btn-accent" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? <Loader2 size={15} className="spin" /> : "Log receipt"}
        </button>
      </form>
    </Modal>
  );
}

function AdjustModal({ warehouses, onClose, onDone, toast }) {
  const [form, setForm] = useState({ sku: "", warehouse_code: "", new_on_hand: "", reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await inventoryApi.adjust({
        sku: form.sku.trim(),
        warehouse_code: form.warehouse_code,
        new_on_hand: Number(form.new_on_hand),
        reason: form.reason,
      });
      toast.success(res.data.message || "Inventory adjusted.");
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't adjust that count."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Adjust count" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {error && <div style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 13px", borderRadius: 10, fontSize: 13 }}>{error}</div>}
        <div className="field">
          <label>SKU</label>
          <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
        </div>
        <WarehouseSelect value={form.warehouse_code} onChange={(v) => setForm({ ...form, warehouse_code: v })} warehouses={warehouses} />
        <div className="field">
          <label>Correct on-hand count</label>
          <input className="input" type="number" min="0" value={form.new_on_hand} onChange={(e) => setForm({ ...form, new_on_hand: e.target.value })} required />
        </div>
        <div className="field">
          <label>Reason</label>
          <textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Cycle count correction after audit…" required />
        </div>
        <button className="btn btn-accent" type="submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : "Apply adjustment"}
        </button>
      </form>
    </Modal>
  );
}

function TransferModal({ warehouses, onClose, onDone, toast }) {
  const [form, setForm] = useState({ sku: "", from_warehouse_code: "", to_warehouse_code: "", quantity: "", reference: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await inventoryApi.transfer({
        sku: form.sku.trim(),
        from_warehouse_code: form.from_warehouse_code,
        to_warehouse_code: form.to_warehouse_code,
        quantity: Number(form.quantity),
        reference: form.reference,
      });
      toast.success("Transfer complete.");
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't transfer that stock."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Transfer between warehouses" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {error && <div style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 13px", borderRadius: 10, fontSize: 13 }}>{error}</div>}
        <div className="field">
          <label>SKU</label>
          <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><WarehouseSelect label="From" value={form.from_warehouse_code} onChange={(v) => setForm({ ...form, from_warehouse_code: v })} warehouses={warehouses} /></div>
          <div className="grow"><WarehouseSelect label="To" value={form.to_warehouse_code} onChange={(v) => setForm({ ...form, to_warehouse_code: v })} warehouses={warehouses} /></div>
        </div>
        <div className="field">
          <label>Quantity</label>
          <input className="input" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <div className="field">
          <label>Reference <span className="muted">(optional)</span></label>
          <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
        <button className="btn btn-accent" type="submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : "Transfer stock"}
        </button>
      </form>
    </Modal>
  );
}
