import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, AlertTriangle, Truck, Boxes, ArrowUpRight, Clock } from "lucide-react";
import { inventoryApi } from "../api/endpoints";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";

const STAGE_LABELS = {
  RECEIVED: "Received",
  PULLING: "Pulling",
  PACKING: "Packing",
  SHIPPED: "Shipped",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    inventoryApi
      .dashboard()
      .then((res) => mounted && setData(res.data))
      .catch(() => mounted && setError("Couldn't load the dashboard right now."));
    return () => { mounted = false; };
  }, []);

  const totals = (data?.warehouses || []).reduce(
    (acc, w) => ({
      units: acc.units + w.units_on_hand,
      available: acc.available + w.units_available,
      belowReorder: acc.belowReorder + w.below_reorder,
      openOrders: acc.openOrders + w.open_orders,
      shippedToday: acc.shippedToday + w.shipped_today,
    }),
    { units: 0, available: 0, belowReorder: 0, openOrders: 0, shippedToday: 0 }
  );

  const pipeline = data?.pipeline || {};
  const pipelineMax = Math.max(1, ...Object.values(pipeline).map((v) => Number(v) || 0));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Overview</span>
          <h1 className="page-title">{greeting()}, {user?.full_name?.split(" ")[0] || user?.username}.</h1>
          <p className="page-sub">Here's the live state of both floors, as of right now.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/orders" className="btn btn-ghost">
            <Truck size={15} /> Fulfillment board
          </Link>
          <Link to="/voice" className="btn btn-primary">
            Receive stock <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>

      {error && <div className="empty card card-pad">{error}</div>}

      {!data && !error && (
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 118, borderRadius: 20 }} />)}
        </div>
      )}

      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Units on hand" value={totals.units.toLocaleString()} sub={`${totals.available.toLocaleString()} available to promise`} icon={Boxes} tone="ink" />
            <StatCard label="Open orders" value={totals.openOrders.toLocaleString()} sub="Across both warehouses" icon={Package} tone="accent" />
            <StatCard label="Below reorder point" value={totals.belowReorder.toLocaleString()} sub="SKUs need a purchase order" icon={AlertTriangle} tone={totals.belowReorder > 0 ? "warn" : "good"} />
            <StatCard label="Shipped today" value={totals.shippedToday.toLocaleString()} sub="Orders that left the dock" icon={Truck} tone="good" />
          </div>

          <div className="dash-grid">
            <div className="card card-pad">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
                <h3 style={{ fontSize: 16 }}>Fulfillment pipeline</h3>
                <Link to="/orders" className="mini-link">Open board</Link>
              </div>
              <div className="pipeline-flow">
                {Object.entries(STAGE_LABELS).map(([key, label], i, arr) => {
                  const val = Number(pipeline[key]) || 0;
                  return (
                    <div className="pipeline-stage" key={key}>
                      <div className="pipeline-bar-track">
                        <div
                          className={`pipeline-bar stage-${key}`}
                          style={{ height: `${Math.max(6, (val / pipelineMax) * 100)}%` }}
                        />
                      </div>
                      <div className="pipeline-val">{val}</div>
                      <div className="pipeline-label">{label}</div>
                      {i < arr.length - 1 && <div className="pipeline-connector" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card card-pad">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
                <h3 style={{ fontSize: 16 }}>Warehouse split</h3>
              </div>
              <div className="wh-split-list">
                {(data.warehouses || []).map((w) => (
                  <div key={w.warehouse_code} className="wh-split-row">
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`badge ${w.warehouse_code.toLowerCase().includes("reno") || w.warehouse_code === "RNO" ? "badge-reno" : "badge-columbus"}`}>
                        {w.warehouse_code}
                      </span>
                      <span className="soft" style={{ fontSize: 13 }}>{w.warehouse_name}</span>
                    </div>
                    <div className="wh-split-stats">
                      <span><strong>{w.units_on_hand.toLocaleString()}</strong> on hand</span>
                      <span><strong>{w.open_orders}</strong> open</span>
                      {w.below_reorder > 0 && <span className="warn"><strong>{w.below_reorder}</strong> low</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <div className="row" style={{ justifyContent: "space-between", padding: "20px 24px 14px" }}>
              <h3 style={{ fontSize: 16 }}>Needs a reorder</h3>
              <Link to="/inventory" className="mini-link">View inventory</Link>
            </div>
            {(!data.low_stock || data.low_stock.length === 0) ? (
              <div className="empty">
                <h4>Nothing below reorder point</h4>
                <p>Every SKU across both floors is holding steady.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>SKU</th><th>Product</th><th>Warehouse</th><th>Available</th><th>Reorder at</th><th>Bin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.low_stock.map((row) => (
                      <tr key={row.id}>
                        <td className="mono">{row.sku}</td>
                        <td>{row.product_name}</td>
                        <td>{row.warehouse_code}</td>
                        <td><span className="badge badge-warn"><Clock size={11} />{row.available}</span></td>
                        <td>{row.reorder_point}</td>
                        <td className="mono muted">{row.bin_location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 22px;
        }
        .dash-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 18px;
        }
        .mini-link { font-size: 12.5px; font-weight: 600; color: var(--c-accent); }
        .pipeline-flow {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          height: 200px;
          padding-top: 6px;
        }
        .pipeline-stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          height: 100%;
        }
        .pipeline-bar-track {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .pipeline-bar {
          width: 56%;
          border-radius: 10px 10px 4px 4px;
          transition: height var(--dur-slow) var(--ease-spring);
          min-height: 6px;
        }
        .stage-received { background: linear-gradient(180deg, #b8c2cc, #93a0ac); }
        .stage-pulling { background: linear-gradient(180deg, #ffc266, #ffab33); }
        .stage-packing { background: linear-gradient(180deg, #7fb8ff, #4d9bff); }
        .stage-shipped { background: linear-gradient(180deg, #6fe0a3, #34c77a); }
        .pipeline-val { font-family: var(--f-display); font-weight: 600; font-size: 17px; margin-top: 10px; }
        .pipeline-label { font-size: 11.5px; color: var(--c-ink-faint); margin-top: 2px; }
        .wh-split-list { display: flex; flex-direction: column; gap: 4px; }
        .wh-split-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 6px;
          border-bottom: 1px solid var(--c-border-soft);
        }
        .wh-split-row:last-child { border-bottom: none; }
        .wh-split-stats { display: flex; gap: 14px; font-size: 12px; color: var(--c-ink-faint); }
        .wh-split-stats strong { color: var(--c-ink); font-weight: 700; }
        .wh-split-stats .warn strong { color: var(--c-warn); }

        @media (max-width: 1100px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
          .dash-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
