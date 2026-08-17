import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2, RefreshCcw } from "lucide-react";
import { auditApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";

const PAGE_SIZE = 25;

export default function Audit() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);

  function load(p) {
    auditApi
      .logs({ limit: PAGE_SIZE, offset: p * PAGE_SIZE })
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err, "Couldn't load the audit log.")));
  }

  useEffect(() => { load(page); /* eslint-disable-next-line */ }, [page]);

  async function verify() {
    setVerifying(true);
    try {
      const res = await auditApi.verify();
      setVerification(res.data);
    } catch (err) {
      setVerification({ verified: false, message: apiErrorMessage(err, "Verification failed.") });
    } finally {
      setVerifying(false);
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Accountability</span>
          <h1 className="page-title">Audit trail</h1>
          <p className="page-sub">Hash-chained and append-only — every action is attributed, and tampering breaks the chain visibly.</p>
        </div>
        <button className="btn btn-ghost" onClick={verify} disabled={verifying}>
          {verifying ? <Loader2 size={15} className="spin" /> : <><ShieldCheck size={15} /> Verify chain</>}
        </button>
      </div>

      {verification && (
        <div className={`verify-banner ${verification.verified ? "good" : "bad"} fade-in`}>
          {verification.verified ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          <div>
            <strong>{verification.verified ? "Chain intact" : "Chain broken"}</strong>
            <p>{verification.message}{verification.entries_checked != null ? ` · ${verification.entries_checked} entries checked` : ""}{verification.first_broken_sequence != null ? ` · first break at #${verification.first_broken_sequence}` : ""}</p>
          </div>
        </div>
      )}

      {error && <div className="empty card card-pad">{error}</div>}
      {!data && !error && <div className="skeleton" style={{ height: 500, borderRadius: 20 }} />}

      {data && (
        <div className="card table-wrap">
          <table className="grid">
            <thead>
              <tr><th>#</th><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th><th>Warehouse</th><th>Hash</th></tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono muted">{e.sequence}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{new Date(e.timestamp).toLocaleString()}</td>
                  <td>{e.username}</td>
                  <td><span className="badge badge-neutral" style={{ textTransform: "capitalize" }}>{e.role}</span></td>
                  <td style={{ textTransform: "capitalize" }}>{e.action.replace(/_/g, " ")}</td>
                  <td className="mono muted">{e.entity_type}:{String(e.entity_id).slice(0, 8)}</td>
                  <td>{e.warehouse_location || "—"}</td>
                  <td className="mono muted" title={e.entry_hash}>{e.entry_hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ justifyContent: "space-between", padding: "14px 20px" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{data.total} entries total</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</button>
              <span className="muted" style={{ fontSize: 12.5 }}>{page + 1} / {Math.max(1, totalPages)}</span>
              <button className="btn btn-ghost btn-sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .verify-banner {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 18px; border-radius: var(--r-lg);
          margin-bottom: 18px;
        }
        .verify-banner.good { background: var(--c-good-soft); color: var(--c-good); }
        .verify-banner.bad { background: var(--c-bad-soft); color: var(--c-bad); }
        .verify-banner strong { display: block; font-size: 13.5px; margin-bottom: 2px; }
        .verify-banner p { font-size: 12.5px; opacity: 0.85; }
      `}</style>
    </div>
  );
}
