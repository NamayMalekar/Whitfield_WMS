import { Navigate, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { EmptyState, Spinner } from './ui'

export default function ProtectedRoute({ children, permission }) {
  const { user, loading, can } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (permission && !can(permission)) {
    return (
      <div className="card">
        <EmptyState
          icon={Lock}
          title="Not your access level"
          hint="Ask a supervisor if you need this area for your shift."
        />
      </div>
    )
  }
  return children
}
