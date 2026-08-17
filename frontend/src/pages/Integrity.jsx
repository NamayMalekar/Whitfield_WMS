import { useEffect, useState } from "react";
import { ShieldCheck, Play, Loader2, Terminal, ChevronDown } from "lucide-react";
import { scriptingApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useWarehouse } from "../context/WarehouseContext";
import { useToast } from "../context/ToastContext";

const SEVERITY_TONE = { critical: "badge-bad", high: "badge-bad", medium: "badge-warn", low: "badge-neutral", info: "badge-accent" };

export default function Integrity() {
  const { active } = useWarehouse();
  const toast = useToast();
  const [checks, setChecks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [runs, setRuns] = useState(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("Custom check");
  const [customSource, setCustomSource] = useState("");
  const [customRunning, setCustomRunning] = useState(false);
  const [sample, setSample] = useState("");

  function load() {
    scriptingApi.runs({ limit: 20 }).then((res) => setRuns(res.data)).catch(() => {});
  }

  useEffect(() => {
    scriptingApi.builtinChecks().then((res) => {
      setChecks(res.data);
      setSelected(new Set(res.data.map((c) => c.key)));
    }).catch(() => {});
    scriptingApi.sample().then((res) => setSample(res.data.source || res.data.sample || JSON.stringify(res.data))).catch(() => {});
    load();
    // eslint-disable-next-line
  }, []);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function runChecks() {
    setRunning(true);
    try {
      const res = await scriptingApi.runChecks({
        checks: Array.from(selected),
        warehouse_code: active !== "all" ? active : undefined,
      });
      const findingsCount = res.data.findings?.length || 0;
      toast[findingsCount > 0 ? "info" : "success"](
        findingsCount > 0 ? `${findingsCount} finding${findingsCount === 1 ? "" : "s"} to review.` : "All clear — no findings."
      );
      load();
      setExpanded(res.data.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't run those checks."));
    } finally {
      setRunning(false);
    }
  }

  async function runCustom() {
    setCustomRunning(true);
    try {
      const res = await scriptingApi.runCustom({
        name: customName,
        source: customSource,
        warehouse_code: active !== "all" ? active : undefined,
      });
      toast.success("Custom script finished.");
      load();
      setExpanded(res.data.id);
      setCustomOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "That script didn't run cleanly."));
    } finally {
      setCustomRunning(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Integrity engine</span>
          <h1 className="page-title">Automated checks</h1>
          <p className="page-sub">Run built-in reconciliation checks or drop in a custom script — findings land in the run history below.</p>
        </div>
        <button className="btn btn-primary" disabled={running || selected.size === 0} onClick={runChecks}>
          {running ? <Loader2 size={15} className="spin" /> : <><Play size={15} /> Run {selected.size} check{selected.size === 1 ? "" : "s"}</>}
        </button>
      </div>

      <div className="integrity-grid">
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Built-in checks</h3>
          <div className="stack" style={{ gap: 8 }}>
            {checks.map((c) => (
              <label key={c.key} className="check-row">
                <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                    <span className={`badge ${SEVERITY_TONE[c.severity] || "badge-neutral"}`} style={{ fontSize: 10 }}>{c.severity}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.description}</p>
                </div>
              </label>
            ))}
            {checks.length === 0 && <div className="skeleton" style={{ height: 120 }} />}
          </div>

          <hr className="divider" />

          <button className="btn btn-ghost btn-sm" onClick={() => setCustomOpen((v) => !v)}>
            <Terminal size={13} /> Custom script <ChevronDown size={13} style={{ transform: customOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
          </button>

          {customOpen && (
            <div className="stack fade-in" style={{ gap: 10, marginTop: 12 }}>
              <input className="input" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Script name" />
              <textarea
                className="input mono"
                rows={8}
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                placeholder={sample || "# write a check against inventory / orders…"}
                style={{ fontSize: 12.5 }}
              />
              <button className="btn btn-accent btn-sm" disabled={customRunning || !customSource.trim()} onClick={runCustom}>
                {customRunning ? <Loader2 size={14} className="spin" /> : "Run script"}
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", padding: "20px 24px 14px" }}>
            <h3 style={{ fontSize: 15 }}>Run history</h3>
          </div>
          {!runs && <div className="skeleton" style={{ height: 300, margin: "0 20px 20px", borderRadius: 14 }} />}
          {runs && runs.length === 0 && (
            <div className="empty"><h4>No runs yet</h4><p>Run a check to see findings appear here.</p></div>
          )}
          <div className="stack" style={{ gap: 0 }}>
            {runs?.map((run) => (
              <div key={run.id} className="run-row">
                <button className="run-row-head" onClick={() => setExpanded(expanded === run.id ? null : run.id)}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <ShieldCheck size={14} className={run.status === "success" ? "muted" : ""} style={{ color: run.status !== "success" ? "var(--c-bad)" : "var(--c-ink-faint)" }} />
                      <strong style={{ fontSize: 13.5 }}>{run.name}</strong>
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>{run.kind}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {new Date(run.started_at).toLocaleString()} · {run.duration_ms}ms · {run.findings.length} finding{run.findings.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <ChevronDown size={15} style={{ transform: expanded === run.id ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
                </button>
                {expanded === run.id && (
                  <div className="run-detail fade-in">
                    {run.findings.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No findings — everything reconciled.</p>}
                    {run.findings.map((f, i) => (
                      <div key={i} className="finding-row">
                        <span className={`badge ${SEVERITY_TONE[f.severity] || "badge-neutral"}`} style={{ fontSize: 10 }}>{f.severity}</span>
                        <div>
                          <div style={{ fontSize: 13 }}>{f.message}</div>
                          <div className="muted mono" style={{ fontSize: 11 }}>{f.check}{f.warehouse_code ? ` · ${f.warehouse_code}` : ""}{f.entity ? ` · ${f.entity}` : ""}</div>
                        </div>
                      </div>
                    ))}
                    {run.output && (
                      <pre className="run-output mono">{run.output}</pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .integrity-grid { display: grid; grid-template-columns: 380px 1fr; gap: 18px; align-items: start; }
        .check-row {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 9px; border-radius: 10px;
          cursor: pointer;
          transition: background var(--dur-fast);
        }
        .check-row:hover { background: #f8f8f9; }
        .check-row input { margin-top: 3px; }
        .run-row { border-bottom: 1px solid var(--c-border-soft); }
        .run-row:last-child { border-bottom: none; }
        .run-row-head {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 14px 24px; text-align: left;
        }
        .run-row-head:hover { background: #fafafc; }
        .run-detail { padding: 4px 24px 18px; display: flex; flex-direction: column; gap: 10px; }
        .finding-row { display: flex; align-items: flex-start; gap: 10px; }
        .run-output {
          background: #1d1d1f; color: #d4d4d8;
          padding: 12px 14px; border-radius: 10px;
          font-size: 11.5px; overflow-x: auto; white-space: pre-wrap;
        }
        @media (max-width: 980px) { .integrity-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
