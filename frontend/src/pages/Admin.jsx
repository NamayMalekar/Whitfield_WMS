import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, UserPlus } from 'lucide-react'
import { auditApi, authApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWarehouse } from '../context/WarehouseContext'
import AuditLogTable from '../components/AuditLogTable'
import { Banner, PageHeader, RoleBadge, Skeleton } from '../components/ui'

// What a given actor is allowed to promote someone to. Enforced again on
// the backend - this just keeps the dropdown from offering a choice that
// would be rejected.
const ASSIGNABLE_ROLES = {
  SUPERADMIN: ['NEWHIRE', 'VETERAN', 'MANAGER', 'ADMIN', 'SUPERADMIN'],
  ADMIN: ['NEWHIRE', 'VETERAN', 'MANAGER'],
}

export default function Admin() {
  const { user } = useAuth()
  const { warehouses } = useWarehouse()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [verification, setVerification] = useState(null)

  const roleChoices = ASSIGNABLE_ROLES[user?.role] || ASSIGNABLE_ROLES.ADMIN

  const load = useCallback(
    () =>
      authApi
        .listUsers()
        .then(({ data }) => setUsers(data))
        .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const changeRole = (user, role) => {
    authApi
      .updateUser(user.id, { role })
      .then(({ data }) => {
        setMessage({ tone: 'success', message: `${data.username} is now ${data.role}.` })
        load()
      })
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
  }

  const toggleActive = (user) => {
    authApi
      .updateUser(user.id, { is_active: !user.is_active })
      .then(({ data }) => {
        setMessage({
          tone: 'success',
          message: `${data.username} ${data.is_active ? 'reactivated' : 'deactivated'}.`,
        })
        load()
      })
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
  }

  const verify = () => {
    auditApi
      .verify()
      .then(({ data }) => setVerification(data))
      .catch((error) => setMessage({ tone: 'error', message: error.friendlyMessage }))
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Access and history"
        title="Administration"
        actions={
          <>
            <button type="button" className="btn-quiet btn-sm" onClick={verify}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Verify audit chain
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/admin/signup')}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Sign up a person
            </button>
          </>
        }
      >
        New hires cannot adjust counts or confirm orders. Veterans can. Managers run their own
        building. Admins and superadmins can do all of that, plus manage people, across every
        building.
      </PageHeader>

      {message && (
        <Banner tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.message}
        </Banner>
      )}
      {verification && (
        <Banner
          tone={verification.verified ? 'success' : 'error'}
          onDismiss={() => setVerification(null)}
        >
          {verification.message}
        </Banner>
      )}

      <section className="card overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="display-md">People</h2>
          <p className="lede mt-1">{users.length} accounts across both buildings.</p>
        </div>

        {loading ? (
          <div className="space-y-2 border-t border-line p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[780px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-mist">
                  {['Name', 'Username', 'Access level', 'Building', 'Last signed in', 'Status', ''].map(
                    (heading) => (
                      <th key={heading} className="th">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((row) => {
                  // A row can only be re-assigned to a role this actor is
                  // allowed to grant, plus its own current role (so the
                  // select always has a valid selected option).
                  const options = roleChoices.includes(row.role)
                    ? roleChoices
                    : [row.role, ...roleChoices]

                  return (
                    <tr key={row.id} className="row">
                      <td className="td font-medium">{row.full_name}</td>
                      <td className="td data text-slate">{row.username}</td>
                      <td className="td">
                        {roleChoices.length > 0 ? (
                          <select
                            className="field w-auto py-1.5 text-[0.8125rem]"
                            value={row.role}
                            onChange={(event) => changeRole(row, event.target.value)}
                            aria-label={`Access level for ${row.username}`}
                          >
                            {options.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge role={row.role} />
                        )}
                      </td>
                      <td className="td data text-slate">
                        {warehouses.find((warehouse) => warehouse.id === row.warehouse_id)?.code || '—'}
                      </td>
                      <td className="td data whitespace-nowrap text-slate">
                        {row.last_login_at
                          ? new Date(row.last_login_at).toLocaleString(undefined, {
                              month: 'short',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'never'}
                      </td>
                      <td className="td">
                        {row.is_active ? (
                          <RoleBadge role={row.role} />
                        ) : (
                          <span className="pill tint" style={{ color: 'var(--alert)' }}>
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="td text-right">
                        <button
                          type="button"
                          className="btn-bare btn-sm"
                          onClick={() => toggleActive(row)}
                        >
                          {row.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AuditLogTable />
    </div>
  )
}

