import { useEffect, useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { authApi } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useWarehouse } from "../context/WarehouseContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";

const ROLE_TONE = { admin: "badge-bad", veteran: "badge-accent", newhire: "badge-neutral" };

export default function Admin() {
  const { warehouses } = useWarehouse();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [savingId, setSavingId] = useState(null);

  function load() {
    authApi.listUsers().then((res) => setUsers(res.data)).catch((err) => setError(apiErrorMessage(err, "Couldn't load the team.")));
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(u) {
    setSavingId(u.id);
    try {
      await authApi.updateUser(u.id, { is_active: !u.is_active });
      toast.success(`${u.full_name} ${u.is_active ? "deactivated" : "reactivated"}.`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update that user."));
    } finally {
      setSavingId(null);
    }
  }

  async function changeRole(u, role) {
    setSavingId(u.id);
    try {
      await authApi.updateUser(u.id, { role });
      toast.success(`${u.full_name} is now ${role}.`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change that role."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Team</span>
          <h1 className="page-title">People & roles</h1>
          <p className="page-sub">New hire, veteran, admin — access is enforced on every route by role.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <UserPlus size={15} /> Add teammate
        </button>
      </div>

      {error && <div className="empty card card-pad">{error}</div>}
      {!users && !error && <div className="skeleton" style={{ height: 400, borderRadius: 20 }} />}

      {users && (
        <div className="card table-wrap">
          <table className="grid">
            <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Warehouse</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500, color: "var(--c-ink)" }}>{u.full_name}</td>
                  <td className="mono muted">{u.username}</td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <select
                      className="select"
                      style={{ padding: "5px 10px", fontSize: 12.5, width: "auto" }}
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      <option value="newhire">Newhire</option>
                      <option value="veteran">Veteran</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.warehouse_id || "—"}</td>
                  <td>
                    {u.is_active ? <span className="badge badge-good">Active</span> : <span className="badge badge-neutral">Inactive</span>}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" disabled={savingId === u.id} onClick={() => toggleActive(u)}>
                      {savingId === u.id ? <Loader2 size={13} className="spin" /> : u.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          warehouses={warehouses}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function CreateUserModal({ warehouses, onClose, onDone, toast }) {
  const [form, setForm] = useState({ username: "", email: "", full_name: "", password: "", role: "newhire", warehouse_code: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authApi.createUser({ ...form, warehouse_code: form.warehouse_code || undefined });
      toast.success("Teammate added.");
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create that account."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Add teammate" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {error && <div style={{ background: "var(--c-bad-soft)", color: "var(--c-bad)", padding: "10px 13px", borderRadius: 10, fontSize: 13 }}>{error}</div>}
        <div className="field"><label>Full name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow"><label>Username</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
          <div className="field grow"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
        </div>
        <div className="field"><label>Temporary password</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow">
            <label>Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="newhire">Newhire</option>
              <option value="veteran">Veteran</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="field grow">
            <label>Warehouse</label>
            <select className="select" value={form.warehouse_code} onChange={(e) => setForm({ ...form, warehouse_code: e.target.value })}>
              <option value="">Unassigned</option>
              {warehouses.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-accent" type="submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : "Create account"}
        </button>
      </form>
    </Modal>
  );
}
