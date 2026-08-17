import { useEffect, useRef, useState } from "react";
import { Mic, Square, Check, X as XIcon, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { voiceApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useWarehouse } from "../context/WarehouseContext";
import { useToast } from "../context/ToastContext";

const RING_BARS = 28;

export default function Voice() {
  const { warehouses, active } = useWarehouse();
  const toast = useToast();
  const effectiveWh = active !== "all" ? active : warehouses[0]?.code;

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [levels, setLevels] = useState(() => new Array(RING_BARS).fill(0.06));
  const [examples, setExamples] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingExec, setLoadingExec] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    voiceApi.examples().then((res) => setExamples(res.data.examples || [])).catch(() => {});
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSupported(false);
    return () => stopEverything();
    // eslint-disable-next-line
  }, []);

  function stopEverything() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* noop */ } }
    setListening(false);
  }

  async function startListening() {
    setError("");
    setParsed(null);
    setTranscript("");
    setOverrides(null);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtxRef.current.createMediaStreamSource(streamRef.current);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      source.connect(analyserRef.current);
      tickLevels();
    } catch {
      // Mic permission denied — still allow speech recognition without visual ring
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (e) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript((prev) => (final ? (prev + " " + final).trim() : (prev + " " + interim).trim()));
    };
    recognition.onerror = () => {};
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  function tickLevels() {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const step = Math.floor(data.length / RING_BARS) || 1;
    const next = new Array(RING_BARS).fill(0).map((_, i) => {
      const v = data[i * step] || 0;
      return Math.max(0.06, v / 255);
    });
    setLevels(next);
    rafRef.current = requestAnimationFrame(tickLevels);
  }

  function stopListening() {
    stopEverything();
  }

  async function submitTranscript(text) {
    const t = (text || transcript).trim();
    if (!t) return;
    setLoadingParse(true);
    setError("");
    try {
      const res = await voiceApi.parse({
        transcript: t,
        warehouse_code: effectiveWh,
        speech_confidence: 0.9,
      });
      setParsed(res.data);
      setOverrides({
        sku: res.data.command.resolved_sku || res.data.command.sku || "",
        quantity: res.data.command.quantity ?? "",
        damaged_quantity: res.data.command.damaged_quantity ?? 0,
        bin_location: res.data.command.bin_location || "",
        reference: res.data.command.reference || "",
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't parse that command."));
    } finally {
      setLoadingParse(false);
    }
  }

  async function confirmExecute() {
    if (!parsed) return;
    setLoadingExec(true);
    setError("");
    try {
      const res = await voiceApi.execute({
        transcript: parsed.command.raw_transcript,
        warehouse_code: effectiveWh,
        speech_confidence: 0.9,
        overrides: {
          sku: overrides.sku || undefined,
          quantity: overrides.quantity === "" ? undefined : Number(overrides.quantity),
          damaged_quantity: overrides.damaged_quantity === "" ? undefined : Number(overrides.damaged_quantity),
          bin_location: overrides.bin_location || undefined,
          reference: overrides.reference || undefined,
        },
      });
      if (res.data.executed) {
        toast.success(res.data.spoken_confirmation || "Logged.");
        setParsed(null);
        setTranscript("");
        setOverrides(null);
      } else {
        toast.info(res.data.spoken_confirmation || "Nothing was written yet.");
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't confirm that command."));
    } finally {
      setLoadingExec(false);
    }
  }

  function discard() {
    setParsed(null);
    setOverrides(null);
    setTranscript("");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Voice receiving</span>
          <h1 className="page-title">Speak the count</h1>
          <p className="page-sub">Read back, correct, confirm. Nothing writes to inventory until the card says what you meant.</p>
        </div>
      </div>

      {!supported && (
        <div className="empty card card-pad" style={{ marginBottom: 20 }}>
          <AlertCircle size={20} style={{ marginBottom: 8, color: "var(--c-warn)" }} />
          <h4>Voice input isn't available in this browser</h4>
          <p>Try Chrome or Edge for live dictation, or type a command below.</p>
        </div>
      )}

      <div className="voice-grid">
        <div className="card card-pad voice-panel">
          <div className="mic-stage">
            <button
              className={`mic-ring-btn${listening ? " live" : ""}`}
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? "Stop listening" : "Start listening"}
            >
              <div className="mic-bars">
                {levels.map((v, i) => {
                  const angle = (360 / RING_BARS) * i;
                  return (
                    <span
                      key={i}
                      className="mic-bar"
                      style={{
                        transform: `rotate(${angle}deg) translateY(-58px) scaleY(${listening ? Math.max(0.3, v * 2.2) : 0.3})`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mic-core">
                {listening ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
              </div>
            </button>
            <div className="mic-status">
              {listening ? "Listening…" : "Tap to speak"}
            </div>
          </div>

          <div className="field" style={{ marginTop: 8 }}>
            <label>Transcript</label>
            <textarea
              className="input"
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder='e.g. "log fifty units of SKU-1042, two damaged"'
            />
          </div>

          {error && <div style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 13px", borderRadius: 10, fontSize: 13 }}>{error}</div>}

          <button className="btn btn-accent" disabled={loadingParse || !transcript.trim()} onClick={() => submitTranscript()}>
            {loadingParse ? <Loader2 size={15} className="spin" /> : <>Parse command <Sparkles size={14} /></>}
          </button>

          {examples.length > 0 && (
            <div className="voice-examples">
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Try saying</span>
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                {examples.slice(0, 5).map((ex, i) => (
                  <button key={i} className="voice-example-chip" onClick={() => { setTranscript(ex); submitTranscript(ex); }}>
                    "{ex}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card card-pad voice-confirm">
          {!parsed && (
            <div className="empty" style={{ padding: "70px 20px" }}>
              <h4>Nothing to confirm yet</h4>
              <p>Speak or type a command, then review it here before it touches inventory.</p>
            </div>
          )}

          {parsed && (
            <div className="stack fade-in" style={{ gap: 16 }}>
              <div>
                <span className="page-eyebrow" style={{ marginBottom: 4 }}>Parsed as</span>
                <div style={{ fontSize: 18, fontWeight: 600, textTransform: "capitalize" }}>{parsed.command.action.replace(/_/g, " ")}</div>
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{parsed.spoken_confirmation}</p>
              </div>

              {parsed.command.confidence < 0.6 && (
                <div className="row" style={{ gap: 6, color: "var(--c-warn)", fontSize: 12.5 }}>
                  <AlertCircle size={14} /> Low confidence — double check before confirming.
                </div>
              )}

              <div className="row" style={{ gap: 10 }}>
                <div className="field grow">
                  <label>SKU</label>
                  <input className="input" value={overrides.sku} onChange={(e) => setOverrides({ ...overrides, sku: e.target.value })} />
                </div>
                <div className="field" style={{ width: 100 }}>
                  <label>Qty</label>
                  <input className="input" type="number" value={overrides.quantity} onChange={(e) => setOverrides({ ...overrides, quantity: e.target.value })} />
                </div>
                <div className="field" style={{ width: 100 }}>
                  <label>Damaged</label>
                  <input className="input" type="number" value={overrides.damaged_quantity} onChange={(e) => setOverrides({ ...overrides, damaged_quantity: e.target.value })} />
                </div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div className="field grow">
                  <label>Bin location</label>
                  <input className="input" value={overrides.bin_location} onChange={(e) => setOverrides({ ...overrides, bin_location: e.target.value })} />
                </div>
                <div className="field grow">
                  <label>Reference</label>
                  <input className="input" value={overrides.reference} onChange={(e) => setOverrides({ ...overrides, reference: e.target.value })} />
                </div>
              </div>

              {parsed.command.alternatives?.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Did you mean:</span>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {parsed.command.alternatives.map((a) => (
                      <button key={a.sku} className="voice-example-chip" onClick={() => setOverrides({ ...overrides, sku: a.sku })}>
                        {a.sku} {a.name ? `· ${a.name}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {parsed.stock?.length > 0 && (
                <div className="table-wrap" style={{ borderRadius: 12, border: "1px solid var(--c-border-soft)" }}>
                  <table className="grid">
                    <thead><tr><th>SKU</th><th>WH</th><th>On hand</th><th>Available</th></tr></thead>
                    <tbody>
                      {parsed.stock.map((s, i) => (
                        <tr key={i}>
                          <td className="mono">{s.sku}</td>
                          <td>{s.warehouse_code}</td>
                          <td className="mono">{s.on_hand}</td>
                          <td className="mono">{s.available}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-accent grow" disabled={loadingExec || !parsed.can_execute} onClick={confirmExecute}>
                  {loadingExec ? <Loader2 size={15} className="spin" /> : <><Check size={15} /> Confirm & log</>}
                </button>
                <button className="btn btn-ghost" onClick={discard}>
                  <XIcon size={15} /> Discard
                </button>
              </div>
              {!parsed.can_execute && (
                <p className="muted" style={{ fontSize: 12 }}>This was a lookup, not a write — nothing needs confirming.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .voice-grid {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 18px;
          align-items: start;
        }
        .voice-panel { display: flex; flex-direction: column; gap: 16px; }
        .mic-stage { display: flex; flex-direction: column; align-items: center; padding: 12px 0 8px; }
        .mic-ring-btn {
          position: relative;
          width: 148px; height: 148px;
          border-radius: 50%;
          background: transparent;
          display: flex; align-items: center; justify-content: center;
        }
        .mic-bars {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .mic-bar {
          position: absolute;
          width: 3px; height: 14px;
          border-radius: 3px;
          background: var(--c-border);
          transition: transform 90ms linear, background var(--dur-med);
        }
        .mic-ring-btn.live .mic-bar { background: var(--c-accent); }
        .mic-core {
          position: relative; z-index: 2;
          width: 76px; height: 76px;
          border-radius: 50%;
          background: var(--c-ink);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow-md);
          transition: background var(--dur-med), transform var(--dur-fast);
        }
        .mic-ring-btn:active .mic-core { transform: scale(0.94); }
        .mic-ring-btn.live .mic-core { background: var(--c-accent); box-shadow: var(--shadow-glow-accent); }
        .mic-status { margin-top: 12px; font-size: 12.5px; font-weight: 600; color: var(--c-ink-faint); }
        .voice-examples { border-top: 1px solid var(--c-border-soft); padding-top: 14px; margin-top: 4px; }
        .voice-example-chip {
          text-align: left;
          background: #f5f5f7;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 12.5px;
          color: var(--c-ink-soft);
          transition: background var(--dur-fast);
        }
        .voice-example-chip:hover { background: #ececef; }
        .voice-confirm { min-height: 420px; }

        @media (max-width: 980px) {
          .voice-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
