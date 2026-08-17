import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, ArrowRight, Loader2, ShieldCheck, Mic, Radio } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../api/client";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't sign you in. Check your username and password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-visual">
        <div className="login-visual-inner">
          <div className="lv-brand">
            <div className="lv-mark"><Boxes size={20} /></div>
            <span>Whitfield Fulfillment</span>
          </div>

          <h1 className="lv-title">
            Two warehouses.<br />One source of truth.
          </h1>
          <p className="lv-sub">
            Reno and Columbus, running on the same live inventory ledger —
            every receipt, pick and pack accounted for, down to the unit.
          </p>

          <div className="lv-cards">
            <div className="lv-card">
              <Mic size={16} />
              <div>
                <strong>Voice receiving</strong>
                <span>Say the count. Confirm on screen. Nothing writes until you say so.</span>
              </div>
            </div>
            <div className="lv-card">
              <ShieldCheck size={16} />
              <div>
                <strong>Hash-chained audit log</strong>
                <span>Every edit is attributed and tamper-evident, by design.</span>
              </div>
            </div>
            <div className="lv-card">
              <Radio size={16} />
              <div>
                <strong>Live pipeline</strong>
                <span>Received → Pulling → Packing → Shipped, in real time.</span>
              </div>
            </div>
          </div>

          <div className="lv-pulse-row">
            <span className="lv-pulse-dot reno" /> Reno, NV — online
            <span className="lv-pulse-dot columbus" /> Columbus, OH — online
          </div>
        </div>
        <div className="lv-glow" />
      </div>

      <div className="login-form-side">
        <form className="login-form fade-in" onSubmit={onSubmit}>
          <div className="lf-head">
            <h2>Sign in</h2>
            <p>Use your Whitfield operator account.</p>
          </div>

          {error && <div className="lf-error">{error}</div>}

          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="dana.veteran"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button className="btn btn-accent" type="submit" disabled={loading} style={{ width: "100%", padding: "12px 18px", marginTop: 6 }}>
            {loading ? <Loader2 size={16} className="spin" /> : <>Sign in <ArrowRight size={16} /></>}
          </button>

          <p className="lf-hint">
            First time here? Try <code>admin</code> / <code>Whitfield#2026</code>
          </p>
        </form>
      </div>

      <style>{`
        .login-screen {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          background: var(--c-bg);
        }
        .login-visual {
          position: relative;
          background: linear-gradient(155deg, #101012 0%, #1d1d1f 55%, #232326 100%);
          color: #fff;
          padding: 64px;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .lv-glow {
          position: absolute;
          width: 620px; height: 620px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,113,227,0.35), transparent 68%);
          top: -220px; right: -220px;
          filter: blur(10px);
          pointer-events: none;
        }
        .login-visual-inner { position: relative; z-index: 1; max-width: 480px; }
        .lv-brand {
          display: flex; align-items: center; gap: 10px;
          font-family: var(--f-display);
          font-weight: 600;
          font-size: 14.5px;
          color: rgba(255,255,255,0.9);
          margin-bottom: 48px;
        }
        .lv-mark {
          width: 34px; height: 34px; border-radius: 10px;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.14);
          display: flex; align-items: center; justify-content: center;
        }
        .lv-title {
          font-size: 42px;
          line-height: 1.12;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-bottom: 18px;
        }
        .lv-sub {
          font-size: 15.5px;
          line-height: 1.6;
          color: rgba(255,255,255,0.62);
          max-width: 42ch;
          margin-bottom: 40px;
        }
        .lv-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 36px; }
        .lv-card {
          display: flex; align-items: flex-start; gap: 12px;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px;
          padding: 14px 16px;
          transition: background var(--dur-med) var(--ease-out), transform var(--dur-med) var(--ease-out);
        }
        .lv-card:hover { background: rgba(255,255,255,0.08); transform: translateX(3px); }
        .lv-card svg { margin-top: 2px; color: #6cb3ff; flex-shrink: 0; }
        .lv-card strong { display: block; font-size: 13.5px; font-weight: 600; margin-bottom: 2px; }
        .lv-card span { font-size: 12.5px; color: rgba(255,255,255,0.55); line-height: 1.45; }
        .lv-pulse-row {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; color: rgba(255,255,255,0.5);
          flex-wrap: wrap;
        }
        .lv-pulse-dot {
          width: 6px; height: 6px; border-radius: 50%;
          display: inline-block; margin-right: 4px;
          box-shadow: 0 0 0 0 currentColor;
          animation: pulseDot 2s ease-in-out infinite;
        }
        .lv-pulse-dot.reno { background: #ff8a4c; color: rgba(255,138,76,0.5); }
        .lv-pulse-dot.columbus { background: #6cb3ff; color: rgba(108,179,255,0.5); margin-left: 14px; }
        @keyframes pulseDot {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; }
          50% { box-shadow: 0 0 0 5px transparent; }
        }

        .login-form-side {
          display: flex; align-items: center; justify-content: center;
          padding: 40px;
        }
        .login-form { width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 16px; }
        .lf-head h2 { font-size: 24px; margin-bottom: 4px; }
        .lf-head p { color: var(--c-ink-faint); font-size: 13.5px; margin-bottom: 8px; }
        .lf-error {
          background: var(--c-bad-soft); color: var(--c-bad);
          font-size: 13px; padding: 10px 13px; border-radius: 10px;
        }
        .lf-hint {
          text-align: center; font-size: 12px; color: var(--c-ink-faint); margin-top: 8px;
        }
        .lf-hint code {
          background: #f1f1f3; padding: 1px 6px; border-radius: 5px;
          font-family: var(--f-mono); font-size: 11.5px;
        }

        @media (max-width: 980px) {
          .login-screen { grid-template-columns: 1fr; }
          .login-visual { display: none; }
        }
      `}</style>
    </div>
  );
}
