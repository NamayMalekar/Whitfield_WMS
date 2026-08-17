export default function StatCard({ label, value, sub, icon: Icon, tone = "ink", trend }) {
  return (
    <div className="stat-card card card-pad fade-in">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className={`stat-icon tone-${tone}`}>
            <Icon size={15} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {trend != null && (
        <div className={`stat-trend ${trend >= 0 ? "up" : "down"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </div>
      )}

      <style>{`
        .stat-card { position: relative; overflow: hidden; }
        .stat-label {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--c-ink-faint);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .stat-icon {
          width: 28px; height: 28px;
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
        }
        .tone-ink { background: #f1f1f3; color: var(--c-ink-soft); }
        .tone-accent { background: var(--c-accent-soft); color: var(--c-accent); }
        .tone-good { background: var(--c-good-soft); color: var(--c-good); }
        .tone-warn { background: var(--c-warn-soft); color: var(--c-warn); }
        .tone-bad { background: var(--c-bad-soft); color: var(--c-bad); }
        .stat-value {
          font-family: var(--f-display);
          font-size: 30px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--c-ink);
        }
        .stat-sub { font-size: 12.5px; color: var(--c-ink-faint); margin-top: 4px; }
        .stat-trend { font-size: 11.5px; font-weight: 700; margin-top: 8px; }
        .stat-trend.up { color: var(--c-good); }
        .stat-trend.down { color: var(--c-bad); }
      `}</style>
    </div>
  );
}
