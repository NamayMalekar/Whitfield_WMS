import { useState, useRef, useEffect } from "react";
import { ChevronDown, LogOut, MapPin } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useWarehouse } from "../context/WarehouseContext";

export default function TopBar() {
  const { user, logout } = useAuth();
  const { warehouses, active, setActive } = useWarehouse();
  const [openUser, setOpenUser] = useState(false);
  const [openWh, setOpenWh] = useState(false);
  const userRef = useRef(null);
  const whRef = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (userRef.current && !userRef.current.contains(e.target)) setOpenUser(false);
      if (whRef.current && !whRef.current.contains(e.target)) setOpenWh(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = (user?.full_name || user?.username || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar-wh" ref={whRef}>
        <button className="wh-trigger" onClick={() => setOpenWh((v) => !v)}>
          <MapPin size={14} />
          <span>{active === "all" ? "All warehouses" : active}</span>
          <ChevronDown size={14} />
        </button>
        {openWh && (
          <div className="wh-menu fade-in">
            <button
              className={active === "all" ? "wh-item active" : "wh-item"}
              onClick={() => { setActive("all"); setOpenWh(false); }}
            >
              All warehouses
            </button>
            {warehouses.map((w) => (
              <button
                key={w.code}
                className={active === w.code ? "wh-item active" : "wh-item"}
                onClick={() => { setActive(w.code); setOpenWh(false); }}
              >
                {w.name} · {w.city}, {w.state}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-user" ref={userRef}>
        <button className="user-trigger" onClick={() => setOpenUser((v) => !v)}>
          <span className="user-avatar">{initials}</span>
          <span className="user-name">{user?.full_name || user?.username}</span>
          <ChevronDown size={14} />
        </button>
        {openUser && (
          <div className="wh-menu fade-in" style={{ right: 0, left: "auto" }}>
            <div className="user-role-badge">{user?.role}</div>
            <button className="wh-item" onClick={logout}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
      </div>

      <style>{`
        .topbar {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          border-bottom: 1px solid var(--c-border-soft);
          background: rgba(251,251,253,0.85);
          backdrop-filter: blur(16px);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .topbar-wh, .topbar-user { position: relative; }
        .wh-trigger, .user-trigger {
          display: flex; align-items: center; gap: 8px;
          background: var(--c-surface);
          border: 1px solid var(--c-border);
          padding: 7px 13px;
          border-radius: var(--r-pill);
          font-size: 13px;
          font-weight: 600;
          color: var(--c-ink-soft);
          transition: border-color var(--dur-fast), background var(--dur-fast);
        }
        .wh-trigger:hover, .user-trigger:hover { border-color: #c7c7cc; background: #fafafc; }
        .wh-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          background: #fff;
          border: 1px solid var(--c-border-soft);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-lg);
          min-width: 220px;
          padding: 6px;
          z-index: 60;
        }
        .wh-item {
          display: flex; align-items: center; gap: 8px;
          width: 100%;
          text-align: left;
          padding: 9px 11px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 8px;
          color: var(--c-ink-soft);
          background: transparent;
        }
        .wh-item:hover { background: #f3f3f5; color: var(--c-ink); }
        .wh-item.active { color: var(--c-accent); background: var(--c-accent-soft); }
        .user-avatar {
          width: 24px; height: 24px;
          border-radius: 50%;
          background: var(--c-ink);
          color: #fff;
          font-size: 10.5px;
          font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }
        .user-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-role-badge {
          text-transform: uppercase;
          font-size: 10.5px;
          letter-spacing: 0.06em;
          font-weight: 700;
          color: var(--c-ink-faint);
          padding: 6px 11px 8px;
        }
        @media (max-width: 640px) {
          .topbar { padding: 0 16px; }
          .user-name { display: none; }
        }
      `}</style>
    </header>
  );
}
