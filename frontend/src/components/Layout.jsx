import { Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useAuth } from "../context/AuthContext";
import { WarehouseProvider } from "../context/WarehouseContext";

export function ProtectedLayout() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-mark" />
        <style>{`
          .boot-screen { height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--c-bg); }
          .boot-mark { width: 40px; height: 40px; border-radius: 12px; background: var(--c-ink); animation: pulse 1.1s ease-in-out infinite; }
          @keyframes pulse { 0%, 100% { opacity: 0.25; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <WarehouseProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <TopBar />
          <main>
            <Outlet />
          </main>
        </div>
      </div>
    </WarehouseProvider>
  );
}

export function RequirePermission({ perm, children }) {
  const { can, user } = useAuth();
  if (perm && !can(perm) && user?.role !== "admin") {
    return (
      <div className="page">
        <div className="empty card card-pad">
          <h4>Restricted</h4>
          <p>Your role doesn't have access to this area yet. Ask an admin to raise your permissions.</p>
        </div>
      </div>
    );
  }
  return children;
}
