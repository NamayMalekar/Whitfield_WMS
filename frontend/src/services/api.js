import axios from 'axios'

export const TOKEN_KEY = 'whitfield.token'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.assign('/login')
    }
    // Normalise every backend error shape into one readable string.
    const detail = error.response?.data?.detail
    error.friendlyMessage =
      typeof detail === 'string'
        ? detail
        : error.code === 'ECONNABORTED'
          ? 'The server took too long to answer. Try again.'
          : 'Could not reach the server. Check that the API is running.'
    return Promise.reject(error)
  },
)

/** A stable key so a retry after a freeze cannot double-count stock. */
export const newIdempotencyKey = () =>
  (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 40)

export const authApi = {
  login: (username, password) => client.post('/auth/login', { username, password }),
  me: () => client.get('/auth/me'),
  permissions: () => client.get('/auth/me/permissions'),
  listUsers: () => client.get('/auth/users'),
  createUser: (payload) => client.post('/auth/users', payload),
  updateUser: (id, payload) => client.patch(`/auth/users/${id}`, payload),
  forgotPassword: (usernameOrEmail) =>
    client.post('/auth/forgot-password', { username_or_email: usernameOrEmail }),
  resetPassword: (token, newPassword) =>
    client.post('/auth/reset-password', { token, new_password: newPassword }),
}

export const inventoryApi = {
  warehouses: () => client.get('/inventory/warehouses'),
  dashboard: () => client.get('/inventory/dashboard'),
  list: (params) => client.get('/inventory', { params }),
  products: (search) => client.get('/inventory/products', { params: { search } }),
  createProduct: (payload) => client.post('/inventory/products', payload),
  receive: (payload) => client.post('/inventory/receive', payload),
  adjust: (payload) => client.post('/inventory/adjust', payload),
  transfer: (payload) => client.post('/inventory/transfer', payload),
  transactions: (params) => client.get('/inventory/transactions', { params }),
}

export const orderApi = {
  list: (params) => client.get('/orders', { params }),
  board: (warehouseCode) =>
    client.get('/orders/board', { params: { warehouse_code: warehouseCode } }),
  create: (payload) => client.post('/orders', payload),
  confirm: (id) => client.post(`/orders/${id}/confirm`),
  setStatus: (id, status, note = '') => client.patch(`/orders/${id}/status`, { status, note }),
  packOut: (id, payload) => client.patch(`/orders/${id}/pack-out`, payload),
  cancel: (id) => client.post(`/orders/${id}/cancel`),
}

export const voiceApi = {
  examples: () => client.get('/voice/examples'),
  parse: (payload) => client.post('/voice/parse', payload),
  execute: (payload) => client.post('/voice/execute', payload),
}

export const scriptApi = {
  checks: () => client.get('/scripts/checks'),
  sample: () => client.get('/scripts/sample'),
  runs: (limit = 25) => client.get('/scripts/runs', { params: { limit } }),
  runChecks: (payload) => client.post('/scripts/run-checks', payload),
  runCustom: (payload) => client.post('/scripts/run-custom', payload),
}

export const assistantApi = {
  ask: (payload) => client.post('/assistant/ask', payload),
  sops: () => client.get('/assistant/sops'),
}

export const auditApi = {
  logs: (params) => client.get('/audit/logs', { params }),
  verify: () => client.get('/audit/verify'),
}

export default client
