import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Package,
  KanbanSquare,
  Mic,
  ShieldCheck,
  ScrollText,
  Sparkles,
  Users,
  Boxes,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/orders", label: "Fulfillment", icon: KanbanSquare },
  { to: "/voice", label: "Voice receiving", icon: Mic, perm: "voice:use" },
  { to: "/integrity", label: "Integrity checks", icon: ShieldCheck, perm: "script:run" },
  { to: "/audit", label: "Audit trail", icon: ScrollText },
  { to: "/assistant", label: "SOP assistant", icon: Sparkles, perm: "assistant:ask" },
  { to: "/admin", label: "Team", icon: Users, adminOnly: true },
];

export default function Sidebar() {
  const { user, can } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-mark">
          <Boxes size={18} strokeWidth={2.3} />
        </div>
        <div>
          <div className="sidebar-brand-name">Whitfield</div>
          <div className="sidebar-brand-sub">Fulfillment OS</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.filter((item) => {
          if (item.adminOnly && user?.role !== "admin") return false;
          if (item.perm && !can(item.perm)) return false;
          return true;
        }).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <item.icon size={17.5} strokeWidth={2.1} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-warehouses">
          <span className="dot reno" /> Reno, NV
          <span className="dot columbus" /> Columbus, OH
        </div>
      </div>

      <style>{`
        .sidebar {
          background: var(--c-surface);
          border-right: 1px solid var(--c-border-soft);
          padding: 22px 16px;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          height: 100vh;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 6px 8px 26px;
        }
        .sidebar-mark {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(155deg, #1d1d1f, #3a3a3d);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .sidebar-brand-name {
          font-family: var(--f-display);
          font-weight: 600;
          font-size: 15px;
          line-height: 1.15;
          color: var(--c-ink);
        }
        .sidebar-brand-sub {
          font-size: 11.5px;
          color: var(--c-ink-faint);
          letter-spacing: 0.02em;
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 12px;
          border-radius: 11px;
          font-size: 13.8px;
          font-weight: 500;
          color: var(--c-ink-soft);
          transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
        }
        .sidebar-link:hover { background: #f3f3f5; color: var(--c-ink); }
        .sidebar-link.active {
          background: var(--c-ink);
          color: #fff;
        }
        .sidebar-foot {
          padding-top: 14px;
          border-top: 1px solid var(--c-border-soft);
        }
        .sidebar-warehouses {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--c-ink-faint);
          padding: 4px 8px;
          flex-wrap: wrap;
        }
        .dot {
          width: 7px; height: 7px; border-radius: 50%;
          display: inline-block;
        }
        .dot.reno { background: var(--c-reno); margin-right: 2px; }
        .dot.columbus { background: var(--c-columbus); margin-right: 2px; margin-left: 10px; }
        @media (max-width: 980px) {
          .sidebar { display: none; }
        }
      `}</style>
    </aside>
  );
}
