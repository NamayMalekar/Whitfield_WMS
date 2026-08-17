import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, BookOpen } from "lucide-react";
import { aiApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useWarehouse } from "../context/WarehouseContext";

export default function Assistant() {
  const { active } = useWarehouse();
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Ask me about SOPs, stock levels, or how a workflow should go — I'll pull from the live system where it helps." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sops, setSops] = useState([]);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    aiApi.sops().then((res) => setSops(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q) return;
    setError("");
    const history = messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await aiApi.ask({ question: q, warehouse_code: active !== "all" ? active : undefined, history });
      setMessages((m) => [...m, { role: "assistant", content: res.data.answer, followUps: res.data.follow_ups, intent: res.data.intent }]);
    } catch (err) {
      setError(apiErrorMessage(err, "The assistant couldn't answer that."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Knowledge</span>
          <h1 className="page-title">SOP assistant</h1>
          <p className="page-sub">Grounded in your standard operating procedures and live warehouse data.</p>
        </div>
      </div>

      <div className="assist-grid">
        <div className="card assist-chat">
          <div className="assist-scroll" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assist-msg ${m.role} fade-in`}>
                {m.role === "assistant" && <div className="assist-avatar"><Sparkles size={13} /></div>}
                <div className="assist-bubble">
                  {m.content}
                  {m.followUps?.length > 0 && (
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      {m.followUps.map((f, idx) => (
                        <button key={idx} className="voice-example-chip" onClick={() => send(f)}>{f}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="assist-msg assistant">
                <div className="assist-avatar"><Sparkles size={13} /></div>
                <div className="assist-bubble"><Loader2 size={14} className="spin" /></div>
              </div>
            )}
          </div>
          {error && <div style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 16px", fontSize: 13 }}>{error}</div>}
          <form className="assist-input-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a SOP, a stock level, or how to handle an edge case…"
            />
            <button className="btn btn-accent btn-icon" type="submit" disabled={loading || !input.trim()}>
              <Send size={15} />
            </button>
          </form>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            <BookOpen size={15} />
            <h3 style={{ fontSize: 14.5 }}>SOP library</h3>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {sops.map((s) => (
              <button key={s.key} className="sop-item" onClick={() => send(`Explain the SOP: ${s.title}`)}>
                {s.title}
              </button>
            ))}
            {sops.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No SOPs indexed yet.</p>}
          </div>
        </div>
      </div>

      <style>{`
        .assist-grid { display: grid; grid-template-columns: 1fr 280px; gap: 18px; align-items: start; }
        .assist-chat { display: flex; flex-direction: column; height: 620px; }
        .assist-scroll { flex: 1; overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 16px; }
        .assist-msg { display: flex; gap: 10px; max-width: 86%; }
        .assist-msg.user { align-self: flex-end; flex-direction: row-reverse; max-width: 76%; }
        .assist-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          background: var(--c-ink); color: #fff;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .assist-bubble {
          background: #f3f3f5;
          padding: 12px 15px;
          border-radius: 16px 16px 16px 4px;
          font-size: 13.8px;
          line-height: 1.55;
          color: var(--c-ink);
        }
        .assist-msg.user .assist-bubble {
          background: var(--c-ink);
          color: #fff;
          border-radius: 16px 16px 4px 16px;
        }
        .assist-input-row {
          display: flex; gap: 8px;
          padding: 14px 18px;
          border-top: 1px solid var(--c-border-soft);
        }
        .sop-item {
          text-align: left;
          padding: 9px 10px;
          border-radius: 9px;
          font-size: 13px;
          color: var(--c-ink-soft);
        }
        .sop-item:hover { background: #f3f3f5; color: var(--c-ink); }
        @media (max-width: 980px) { .assist-grid { grid-template-columns: 1fr; } .assist-chat { height: 480px; } }
      `}</style>
    </div>
  );
}
