import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import useSpeechToText from '../hooks/useSpeechToText'
import useSpeechSynthesis from '../hooks/useSpeechSynthesis'
import { newIdempotencyKey, voiceApi } from '../services/api'
import { useWarehouse } from '../context/WarehouseContext'
import { Banner, Field } from './ui'

const BLANK_EDIT = { sku: '', quantity: '', damaged_quantity: '', bin_location: '' }

/**
 * Hands-free receiving: speak, read back, correct, confirm.
 *
 * The change that matters here is the correct step. A parser that gets one
 * digit wrong used to mean starting the sentence again with a box in your
 * hands; now every field is editable on screen, the sentence is re-read as you
 * edit, and nothing is written until the numbers on the card are the numbers
 * you meant.
 */
export default function VoiceReceivingWidget({ onLogged, products = [] }) {
  const { active } = useWarehouse()
  const speech = useSpeechToText()
  const voice = useSpeechSynthesis()

  const [status, setStatus] = useState('idle') // idle | parsing | review | saving | done
  const [command, setCommand] = useState(null)
  const [spoken, setSpoken] = useState('')
  const [stock, setStock] = useState([])
  const [canExecute, setCanExecute] = useState(false)
  const [edit, setEdit] = useState(BLANK_EDIT)
  const [error, setError] = useState('')
  const [examples, setExamples] = useState([])
  const [tips, setTips] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)

  const editingRef = useRef(false)
  const lastSpokenRef = useRef('')

  useEffect(() => {
    voiceApi
      .examples()
      .then(({ data }) => {
        setExamples(data.examples || [])
        setTips(data.tips || [])
      })
      .catch(() => setExamples([]))
  }, [])

  /* ---- parse ------------------------------------------------------------ */
  const runParse = useCallback(
    (transcript, overrides, { announce }) => {
      if (!transcript) return
      setStatus((current) => (current === 'review' ? current : 'parsing'))
      voiceApi
        .parse({
          transcript,
          warehouse_code: active,
          speech_confidence: speech.confidence,
          overrides,
        })
        .then(({ data }) => {
          setCommand(data.command)
          setSpoken(data.spoken_confirmation)
          setStock(data.stock || [])
          setCanExecute(data.can_execute)
          setStatus('review')
          if (!editingRef.current) {
            setEdit({
              sku: data.command.resolved_sku || data.command.sku || '',
              quantity: data.command.quantity ?? '',
              damaged_quantity: data.command.damaged_quantity ?? 0,
              bin_location: data.command.bin_location || '',
            })
          }
          if (announce && data.spoken_confirmation !== lastSpokenRef.current) {
            lastSpokenRef.current = data.spoken_confirmation
            voice.speak(data.spoken_confirmation)
          }
        })
        .catch((err) => {
          setError(err.friendlyMessage)
          setStatus('idle')
        })
    },
    [active, speech.confidence, voice],
  )

  // A finished utterance: parse it and read it back.
  useEffect(() => {
    if (!speech.transcript || speech.listening) return
    editingRef.current = false
    runParse(speech.transcript, undefined, { announce: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript, speech.listening])

  // An on-screen edit: re-check it against the catalogue, quietly.
  useEffect(() => {
    if (status !== 'review' || !editingRef.current || !speech.transcript) return undefined
    const timer = setTimeout(() => {
      runParse(
        speech.transcript,
        {
          sku: edit.sku || null,
          quantity: edit.quantity === '' ? null : Number(edit.quantity),
          damaged_quantity: edit.damaged_quantity === '' ? 0 : Number(edit.damaged_quantity),
          bin_location: edit.bin_location || null,
        },
        { announce: false },
      )
    }, 420)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, status])

  /* ---- talk ------------------------------------------------------------- */
  const toggleListening = useCallback(() => {
    if (speech.listening) {
      speech.stop()
      return
    }
    voice.cancel()
    setError('')
    setCommand(null)
    setSpoken('')
    setStock([])
    setStatus('idle')
    editingRef.current = false
    speech.start()
  }, [speech, voice])

  // Push to talk: hold space anywhere that is not a text field.
  useEffect(() => {
    const isTyping = (target) =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

    const down = (event) => {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return
      event.preventDefault()
      if (!speech.listening) toggleListening()
    }
    const up = (event) => {
      if (event.code !== 'Space' || isTyping(event.target)) return
      if (speech.listening) speech.stop()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [speech, toggleListening])

  /* ---- write ------------------------------------------------------------ */
  const confirm = () => {
    setStatus('saving')
    voice.cancel()
    voiceApi
      .execute({
        transcript: speech.transcript,
        warehouse_code: active,
        speech_confidence: speech.confidence,
        idempotency_key: idempotencyKey,
        overrides: {
          sku: edit.sku || null,
          quantity: edit.quantity === '' ? null : Number(edit.quantity),
          damaged_quantity: edit.damaged_quantity === '' ? 0 : Number(edit.damaged_quantity),
          bin_location: edit.bin_location || null,
        },
      })
      .then(({ data }) => {
        setCommand(data.command)
        setSpoken(data.spoken_confirmation)
        setStock(data.stock || [])
        setStatus(data.executed ? 'done' : 'review')
        voice.speak(data.spoken_confirmation)
        if (data.executed) {
          setIdempotencyKey(newIdempotencyKey())
          onLogged?.(data.result)
        }
      })
      .catch((err) => {
        setError(err.friendlyMessage)
        setStatus('review')
      })
  }

  const reset = () => {
    speech.reset()
    voice.cancel()
    editingRef.current = false
    lastSpokenRef.current = ''
    setCommand(null)
    setSpoken('')
    setStock([])
    setEdit(BLANK_EDIT)
    setError('')
    setStatus('idle')
  }

  const setField = (key) => (value) => {
    editingRef.current = true
    setEdit((current) => ({ ...current, [key]: value }))
  }

  const isQuery = command?.action === 'query'
  const showReview = command && ['review', 'saving', 'done'].includes(status)

  return (
    <section className="card flex flex-col overflow-hidden" aria-label="Voice receiving">
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="display-md">Log by voice</h2>
          <p className="lede mt-1">Say the count. Check the card. Then confirm.</p>
        </div>
        <button
          type="button"
          onClick={() => voice.setMuted(!voice.muted)}
          className="icon-btn"
          aria-pressed={voice.muted}
          title={voice.muted ? 'Read-back is off' : 'Read-back is on'}
        >
          {voice.muted ? <VolumeX className="h-[1.125rem] w-[1.125rem]" /> : <Volume2 className="h-[1.125rem] w-[1.125rem]" />}
        </button>
      </header>

      {!speech.supported && (
        <div className="px-5 pt-4">
          <Banner tone="warning">
            This browser has no speech engine. Chrome and Edge support voice receiving; the form
            beside this panel works everywhere.
          </Banner>
        </div>
      )}

      <div className="flex flex-col items-center px-5 py-7">
        <MicStage
          listening={speech.listening}
          bands={speech.bands}
          level={speech.level}
          disabled={!speech.supported || status === 'saving'}
          onToggle={toggleListening}
        />
        <p className="mt-5 text-sm font-medium" aria-live="polite">
          {speech.listening ? 'Listening' : status === 'parsing' ? 'Reading that back' : 'Tap to speak'}
        </p>
        <p className="mt-1 text-xs text-slate">
          {speech.listening ? 'Release space or tap to stop' : 'Or hold the space bar'}
        </p>
      </div>

      {(speech.interim || speech.transcript) && (
        <p className="mx-5 mb-4 rounded-xl bg-mist px-4 py-3 text-center text-[0.9375rem] leading-relaxed">
          {speech.transcript}{' '}
          <span className="text-slate">{speech.interim}</span>
        </p>
      )}

      {speech.error && (
        <div className="px-5 pb-4">
          <Banner tone="error">{speech.error}</Banner>
        </div>
      )}
      {error && (
        <div className="px-5 pb-4">
          <Banner tone="error" onDismiss={() => setError('')}>
            {error}
          </Banner>
        </div>
      )}

      {status === 'parsing' && !command && (
        <div className="px-5 pb-5">
          <div className="skeleton h-24 w-full" />
        </div>
      )}

      {showReview && (
        <div className="animate-rise border-t border-line px-5 py-5">
          <ReadBack
            text={spoken}
            confidence={command.confidence}
            tone={command.clarification ? 'warning' : status === 'done' ? 'success' : 'info'}
          />

          {command.reasons?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {command.reasons.map((reason) => (
                <li key={reason} className="text-xs leading-relaxed text-slate">
                  {reason}
                </li>
              ))}
            </ul>
          )}

          {command.alternatives?.length > 0 && status !== 'done' && (
            <div className="mt-4">
              <p className="eyebrow">Did you mean</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {command.alternatives.map((option) => (
                  <button
                    key={option.sku}
                    type="button"
                    className="btn-quiet btn-sm"
                    onClick={() => setField('sku')(option.sku)}
                  >
                    <span className="data">{option.sku}</span>
                    {option.name && <span className="font-normal text-slate">{option.name}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isQuery && status !== 'done' && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field label="SKU" htmlFor="voice-sku" className="sm:col-span-2">
                <input
                  id="voice-sku"
                  list="voice-sku-options"
                  className="field data"
                  value={edit.sku}
                  onChange={(event) => setField('sku')(event.target.value.toUpperCase())}
                  placeholder="SKU-1042"
                />
                <datalist id="voice-sku-options">
                  {products.map((product) => (
                    <option key={product.id} value={product.sku}>
                      {product.name}
                    </option>
                  ))}
                </datalist>
              </Field>

              <Stepper
                label="Units received"
                id="voice-quantity"
                value={edit.quantity}
                onChange={setField('quantity')}
                min={0}
              />
              <Stepper
                label="Of those, damaged"
                id="voice-damaged"
                value={edit.damaged_quantity}
                onChange={setField('damaged_quantity')}
                min={0}
              />

              <Field label="Bin" htmlFor="voice-bin" className="sm:col-span-2">
                <input
                  id="voice-bin"
                  className="field data"
                  value={edit.bin_location}
                  onChange={(event) => setField('bin_location')(event.target.value.toUpperCase())}
                  placeholder="A12"
                />
              </Field>
            </div>
          )}

          {stock.length > 0 && <StockContext rows={stock} />}

          <div className="mt-5 flex flex-wrap gap-2">
            {status !== 'done' && !isQuery && (
              <button
                type="button"
                onClick={confirm}
                disabled={status === 'saving' || !canExecute}
                className="btn-primary"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {status === 'saving' ? 'Logging' : 'Confirm and log'}
              </button>
            )}
            <button type="button" onClick={reset} className="btn-quiet">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {status === 'done' ? 'Log another' : 'Start over'}
            </button>
          </div>

          {!canExecute && status === 'review' && !isQuery && (
            <p className="mt-3 text-xs text-slate">
              Fill in what is missing above, or say it again. Nothing is written until this card is
              complete.
            </p>
          )}
        </div>
      )}

      {status === 'idle' && examples.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => setShowHelp((open) => !open)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={showHelp}
          >
            <span className="eyebrow">Phrases that work</span>
            <ChevronDown
              className={`h-4 w-4 text-slate transition-transform duration-300 ease-ease ${
                showHelp ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          <ul className="mt-3 space-y-1.5">
            {examples.slice(0, showHelp ? examples.length : 3).map((example) => (
              <li key={example} className="data text-[0.8125rem] leading-relaxed text-slate">
                “{example}”
              </li>
            ))}
          </ul>

          {showHelp && tips.length > 0 && (
            <dl className="mt-4 space-y-3">
              {tips.map((tip) => (
                <div key={tip.title}>
                  <dt className="text-[0.8125rem] font-semibold">{tip.title}</dt>
                  <dd className="text-xs leading-relaxed text-slate">{tip.body}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  )
}

/** The mic, ringed by the actual signal coming off the headset. */
function MicStage({ listening, bands, level, disabled, onToggle }) {
  const size = 168
  const centre = size / 2
  const inner = 58

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {listening && (
        <span
          className="animate-halo absolute inset-6 rounded-full"
          style={{ background: 'var(--cobalt-soft)' }}
          aria-hidden="true"
        />
      )}

      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {!listening && (
          <circle
            cx={centre}
            cy={centre}
            r={inner + 4}
            fill="none"
            stroke="var(--line)"
            strokeWidth="2"
          />
        )}
        {listening && bands.map((band, index) => {
          const angle = (index / bands.length) * Math.PI * 2 - Math.PI / 2
          const length = 5 + band * 26
          const x1 = centre + Math.cos(angle) * inner
          const y1 = centre + Math.sin(angle) * inner
          const x2 = centre + Math.cos(angle) * (inner + length)
          const y2 = centre + Math.sin(angle) * (inner + length)
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth="3"
              strokeLinecap="round"
              stroke="var(--cobalt)"
              opacity={0.35 + band * 0.65}
            />
          )
        })}
      </svg>

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? 'Stop listening' : 'Start listening'}
        className="absolute left-1/2 top-1/2 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2
                   items-center justify-center rounded-full border transition duration-300 ease-ease
                   active:scale-95 disabled:opacity-40"
        style={{
          background: listening ? 'var(--cobalt)' : 'var(--paper)',
          borderColor: listening ? 'var(--cobalt)' : 'var(--line)',
          color: listening ? 'var(--cobalt-ink)' : 'var(--ink)',
          boxShadow: listening
            ? `0 16px 40px -18px var(--cobalt-glow)`
            : '0 1px 2px rgba(10, 23, 48, 0.04)',
          transform: `translate(-50%, -50%) scale(${listening ? 1 + Math.min(level, 1) * 0.05 : 1})`,
        }}
      >
        <Mic className="h-8 w-8" aria-hidden="true" />
      </button>
    </div>
  )
}

function ReadBack({ text, confidence, tone }) {
  const color =
    tone === 'warning' ? 'var(--packing)' : tone === 'success' ? 'var(--shipped)' : 'var(--cobalt)'
  const pct = Math.round((confidence || 0) * 100)

  return (
    <div
      className="rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 26%, transparent)`,
        background: `color-mix(in srgb, ${color} 7%, var(--paper))`,
      }}
    >
      <p className="text-[0.9375rem] leading-relaxed">{text}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="eyebrow shrink-0">Heard</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-mist">
          <span
            className="block h-full rounded-full transition-[width] duration-500 ease-ease"
            style={{ width: `${pct}%`, background: color }}
          />
        </span>
        <span className="data text-xs text-slate">{pct}%</span>
      </div>
    </div>
  )
}

function StockContext({ rows }) {
  return (
    <div className="mt-5">
      <p className="eyebrow">On the shelf now</p>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div
            key={`${row.sku}-${row.warehouse_code}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist px-3.5 py-2.5"
          >
            <span className="text-[0.8125rem] font-medium">{row.warehouse_code}</span>
            <span className="data text-[0.8125rem] text-slate">
              <span className="font-semibold text-ink">{row.available}</span> available ·{' '}
              {row.on_hand} on hand
              {row.damaged ? ` · ${row.damaged} damaged` : ''}
              {row.bin_location ? ` · bin ${row.bin_location}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stepper({ label, id, value, onChange, min = 0 }) {
  const numeric = value === '' ? null : Number(value)
  const step = (delta) => onChange(String(Math.max(min, (numeric ?? 0) + delta)))

  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-stretch gap-1.5">
        <button type="button" onClick={() => step(-1)} className="icon-btn border border-line" aria-label={`${label} down`}>
          <Minus className="h-4 w-4" />
        </button>
        <input
          id={id}
          type="number"
          min={min}
          inputMode="numeric"
          className="field data flex-1 text-center text-lg font-semibold"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" onClick={() => step(1)} className="icon-btn border border-line" aria-label={`${label} up`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </Field>
  )
}
