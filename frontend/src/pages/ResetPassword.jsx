import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { authApi } from '../services/api'
import { Banner, Field } from '../components/ui'
import Wordmark from '../components/Wordmark'

export default function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    authApi
      .resetPassword(token, password)
      .then(() => setDone(true))
      .catch((err) => setError(err.friendlyMessage || 'That link is invalid or has expired.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5 py-12 sm:px-10">
      <div className="animate-rise w-full max-w-[22rem]">
        <Wordmark size="lg" />

        <h2 className="display-lg mt-8">Set a new password</h2>
        <p className="lede mt-2">Choose a new password for your account.</p>

        {done ? (
          <>
            <Banner tone="success" className="mt-6">
              Password updated. Sign in with your new password.
            </Banner>
            <button type="button" className="btn-primary mt-6 w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="New password" htmlFor="password">
              <input
                id="password"
                type="password"
                className="field"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </Field>

            <Field label="Confirm new password" htmlFor="confirm">
              <input
                id="confirm"
                type="password"
                className="field"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={8}
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
              {busy ? 'Saving' : 'Save new password'}
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
