import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { authApi } from '../services/api'
import { Banner, Field } from '../components/ui'
import Wordmark from '../components/Wordmark'

export default function ForgotPassword() {
  const [value, setValue] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    authApi
      .forgotPassword(value)
      .then(() => setSent(true))
      .catch((err) => setError(err.friendlyMessage || 'Something went wrong. Try again.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5 py-12 sm:px-10">
      <div className="animate-rise w-full max-w-[22rem]">
        <Wordmark size="lg" />

        <h2 className="display-lg mt-8">Reset your password</h2>
        <p className="lede mt-2">
          Enter your username or email. If an account matches, we'll send a reset link.
        </p>

        {sent ? (
          <Banner tone="success" className="mt-6">
            If that account exists, a password reset link has been sent to it. The link expires
            in 30 minutes.
          </Banner>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Username or email" htmlFor="identifier">
              <input
                id="identifier"
                className="field"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
              />
            </Field>

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
              {busy ? 'Sending' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-8 text-xs leading-relaxed text-slate">
          <Link to="/login" className="font-medium text-ink underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
