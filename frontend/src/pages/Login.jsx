import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Banner, Field } from '../components/ui'
import Wordmark from '../components/Wordmark'

const STAGES = [
  { label: 'Received', color: 'var(--received)' },
  { label: 'Pulling', color: 'var(--pulling)' },
  { label: 'Packing', color: 'var(--packing)' },
  { label: 'Shipped', color: 'var(--shipped)' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.friendlyMessage || 'That username and password did not match. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* The thesis: one rail, four stages, and the order moving along it. */}
      <section
        className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'linear-gradient(155deg, #0A1730 0%, #101F45 52%, #16295C 100%)' }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, #2A4FE0 0%, transparent 68%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-0 h-[26rem] w-[26rem] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #6E9BFF 0%, transparent 70%)' }}
        />

        <div className="relative text-white">
          <div className="[--cobalt:#ffffff] [--cobalt-ink:#0A1730]">
            <Wordmark size="lg" />
          </div>
        </div>

        <div className="relative max-w-md text-white">
          <h1 className="font-display text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.04em]">
            Two buildings,
            <br />
            one live count.
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/65">
            Reno and Columbus on the same screen. Every receipt carries a one-time key, every
            confirmation takes a lock, and every write signs the log.
          </p>

          <div className="mt-12">
            <div className="relative h-[3px] overflow-hidden rounded-full bg-white/15">
              <div className="rail-track h-full w-full opacity-80" />
              <span
                aria-hidden="true"
                className="animate-travel absolute inset-y-0 left-0 w-1/4 [animation-duration:3.6s] [animation-iteration-count:infinite]"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)',
                }}
              />
            </div>
            <div className="mt-3 flex justify-between">
              {STAGES.map((stage) => (
                <span key={stage.label} className="flex items-center gap-1.5 text-xs text-white/60">
                  <i
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: stage.color }}
                    aria-hidden="true"
                  />
                  {stage.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="relative text-xs text-white/40">Whitfield Fulfillment · Warehouse management</p>
      </section>

      <section className="flex items-center justify-center bg-paper px-5 py-12 sm:px-10">
        <div className="animate-rise w-full max-w-[22rem]">
          <div className="lg:hidden">
            <Wordmark size="lg" />
          </div>

          <h2 className="display-lg mt-8 lg:mt-0">Sign in</h2>
          <p className="lede mt-2">Log receipts, move orders, check stock.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Username" htmlFor="username">
              <input
                id="username"
                className="field"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                className="field"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>

            <p className="text-right text-xs">
              <Link to="/forgot-password" className="font-medium text-ink underline underline-offset-2">
                Forgot password?
              </Link>
            </p>

            {error && <Banner tone="error">{error}</Banner>}

            <button type="submit" className="btn-primary group mt-2 w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 ease-ease group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              )}
              {busy ? 'Signing in' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs leading-relaxed text-slate">
            Trouble signing in? Ask a supervisor to check your account is still active in Admin.
          </p>
        </div>
      </section>
    </div>
  )
}
