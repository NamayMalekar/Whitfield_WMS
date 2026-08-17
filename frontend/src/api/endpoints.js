import client from "./client";

/* ---------------- Auth ---------------- */
export const authApi = {
  login: (username, password) => client.post("/api/auth/login", { username, password }),
  forgotPassword: (username_or_email) => client.post("/api/auth/forgot-password", { username_or_email }),
  resetPassword: (token, new_password) => client.post("/api/auth/reset-password", { token, new_password }),
  me: () => client.get("/api/auth/me"),
  myPermissions: () => client.get("/api/auth/me/permissions"),
  listUsers: () => client.get("/api/auth/users"),
  createUser: (payload) => client.post("/api/auth/users", payload),
  updateUser: (userId, payload) => client.patch(`/api/auth/users/${userId}`, payload),
};

/* ---------------- Inventory ---------------- */
export const inventoryApi = {
  warehouses: () => client.get("/api/inventory/warehouses"),
  dashboard: () => client.get("/api/inventory/dashboard"),
  list: (params) => client.get("/api/inventory", { params }),
  products: (params) => client.get("/api/inventory/products", { params }),
  createProduct: (payload) => client.post("/api/inventory/products", payload),
  receive: (payload) => client.post("/api/inventory/receive", payload),
  adjust: (payload) => client.post("/api/inventory/adjust", payload),
  transfer: (payload) => client.post("/api/inventory/transfer", payload),
  transactions: (params) => client.get("/api/inventory/transactions", { params }),
};

/* ---------------- Orders ---------------- */
export const orderApi = {
  list: (params) => client.get("/api/orders", { params }),
  board: (params) => client.get("/api/orders/board", { params }),
  get: (orderId) => client.get(`/api/orders/${orderId}`),
  create: (payload) => client.post("/api/orders", payload),
  confirm: (orderId) => client.post(`/api/orders/${orderId}/confirm`),
  changeStatus: (orderId, payload) => client.patch(`/api/orders/${orderId}/status`, payload),
  packOut: (orderId, payload) => client.patch(`/api/orders/${orderId}/pack-out`, payload),
  cancel: (orderId) => client.post(`/api/orders/${orderId}/cancel`),
};

/* ---------------- Voice ---------------- */
export const voiceApi = {
  examples: () => client.get("/api/voice/examples"),
  parse: (payload) => client.post("/api/voice/parse", payload),
  execute: (payload) => client.post("/api/voice/execute", payload),
};

/* ---------------- Scripting / integrity checks ---------------- */
export const scriptingApi = {
  builtinChecks: () => client.get("/api/scripting/checks"),
  sample: () => client.get("/api/scripting/sample"),
  runs: (params) => client.get("/api/scripting/runs", { params }),
  runChecks: (payload) => client.post("/api/scripting/run-checks", payload),
  runCustom: (payload) => client.post("/api/scripting/run-custom", payload),
};

/* ---------------- Audit ---------------- */
export const auditApi = {
  logs: (params) => client.get("/api/audit/logs", { params }),
  verify: () => client.get("/api/audit/verify"),
};

/* ---------------- AI assistant ---------------- */
export const aiApi = {
  ask: (payload) => client.post("/api/ai/ask", payload),
  sops: () => client.get("/api/ai/sops"),
};
