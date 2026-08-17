import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ProtectedLayout, RequirePermission } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Orders from "./pages/Orders";
import Voice from "./pages/Voice";
import Integrity from "./pages/Integrity";
import Audit from "./pages/Audit";
import Assistant from "./pages/Assistant";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/voice" element={<RequirePermission perm="voice:use"><Voice /></RequirePermission>} />
            <Route path="/integrity" element={<RequirePermission perm="script:run"><Integrity /></RequirePermission>} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/assistant" element={<RequirePermission perm="assistant:ask"><Assistant /></RequirePermission>} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
