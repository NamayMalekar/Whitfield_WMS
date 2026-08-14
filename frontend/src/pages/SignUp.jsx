import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { authApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWarehouse } from '../context/WarehouseContext'
import { Banner, Field, PageHeader } from '../components/ui'

// What a given actor is allowed to hand out. Only a superadmin can create
// another admin or superadmin - this is enforced again on the backend, this
// is just so the dropdown doesn't offer something that will be rejected.
const ROLE_OPTIONS = {
  SUPERADMIN: [
    ['NEWHIRE', 'New hire'],
    ['VETERAN', 'Veteran'],
    ['MANAGER', 'Manager (one building)'],
    ['ADMIN', 'Admin (all buildings)'],
    ['SUPERADMIN', 'Superadmin (all buildings)'],
  ],
  ADMIN: [
    ['NEWHIRE', 'New hire'],
    ['VETERAN', 'Veteran'],
    ['MANAGER', 'Manager (one building)'],
  ],
}

const emptyForm = {
  username: '',
  email: '',
  full_name: '',
  password: '',
  role: 'NEWHIRE',
  warehouse_code: '',
}

export default function SignUp() {
  const { user } = useAuth()
  const { warehouses } = useWarehouse()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)

  const roleOptions = ROLE_OPTIONS[user?.role] || ROLE_OPTIONS.ADMIN
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const needsWarehouse = form.role === 'MANAGER'

  const submit = (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    authApi
      .createUser({ ...form, warehouse_code: form.warehouse_code || null })
      .then(({ data }) => {
        setCreated(data)
        setForm(emptyForm)
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => setBusy(false))
  }

  return (
    <div className="mx-auto max-w-lg space-y-7">
      <button type="button" className="btn-quiet btn-sm" onClick={() => navigate('/admin')}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Admin
      </button>

      <PageHeader eyebrow="Invite-only" title="Sign up a new person">
        Only an admin or superadmin can create an account here. There is no self-service
        registration and no one-click sign-in for the account you create - the person you're
        adding gets a username and a temporary password, and signs in for themselves.
      </PageHeader>

      {error && <Banner tone="error">{error}</Banner>}

      {created ? (
        <Banner tone="success" onDismiss={() => setCreated(null)}>
          {created.full_name} was created as {created.role}
          {created.warehouse_id
            ? ` at ${warehouses.find((w) => w.id === created.warehouse_id)?.city || 'their building'}`
            : ''}
          . Share the username and temporary password with them directly - ask them to change the
          password after their first sign in.
        </Banner>
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" htmlFor="full_name">
              <input id="full_name" className="field" value={form.full_name} onChange={update('full_name')} required />
            </Field>
            <Field label="Username" htmlFor="username">
              <input id="username" className="field" value={form.username} onChange={update('username')} required />
            </Field>
          </div>

          <Field label="Email" htmlFor="email">
            <input id="email" type="email" className="field" value={form.email} onChange={update('email')} required />
          </Field>

          <Field label="Temporary password" htmlFor="password" hint="They should change this after their first sign in.">
            <input
              id="password"
              type="password"
              className="field"
              value={form.password}
              onChange={update('password')}
              minLength={8}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Access level" htmlFor="role">
              <select id="role" className="field" value={form.role} onChange={update('role')}>
                {roleOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Home building"
              htmlFor="warehouse_code"
              hint={needsWarehouse ? 'Required for a manager account.' : undefined}
            >
              <select
                id="warehouse_code"
                className="field"
                value={form.warehouse_code}
                onChange={update('warehouse_code')}
                required={needsWarehouse}
              >
                <option value="">{needsWarehouse ? 'Choose a building' : 'None'}</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.code}>
                    {warehouse.city}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="text-xs leading-relaxed text-slate">
            A manager account only ever sees its own building's inventory, orders and activity
            log. Admin and superadmin accounts see every building.
          </p>

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Creating account' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  )
}
