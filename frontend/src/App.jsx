import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { WarehouseProvider } from './context/WarehouseContext'
import { ThemeProvider } from './context/ThemeContext'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Receiving from './pages/Receiving'
import Fulfillment from './pages/Fulfillment'
import ScriptingEngine from './pages/ScriptingEngine'
import AssistantChat from './pages/AssistantChat'
import Admin from './pages/Admin'
import SignUp from './pages/SignUp'

/** Re-mounts on every route change, so each page arrives rather than snapping in. */
function PageTransition({ children }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="animate-rise">
      {children}
    </div>
  )
}

function Shell({ children }) {
  const { user } = useAuth()
  if (!user) return <div className="min-h-screen bg-canvas">{children}</div>
  return (
    <AppShell>
      <PageTransition>{children}</PageTransition>
    </AppShell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <WarehouseProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route
                path="/*"
                element={
                  <Shell>
                    <Routes>
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <Dashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/receiving"
                        element={
                          <ProtectedRoute permission="inventory:receive">
                            <Receiving />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/fulfillment"
                        element={
                          <ProtectedRoute permission="order:read">
                            <Fulfillment />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/scripts"
                        element={
                          <ProtectedRoute permission="script:run">
                            <ScriptingEngine />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/assistant"
                        element={
                          <ProtectedRoute permission="assistant:ask">
                            <AssistantChat />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute permission="user:manage">
                            <Admin />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/signup"
                        element={
                          <ProtectedRoute permission="user:manage">
                            <SignUp />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Shell>
                }
              />
            </Routes>
          </WarehouseProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
