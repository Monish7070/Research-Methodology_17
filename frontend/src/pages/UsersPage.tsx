import { Plus, Shield, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  StatCard,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import type { RoleName, User } from "../types";
import { formatDate, titleCase } from "../utils/format";

interface UsersResponse {
  items: User[];
  roles: { name: string; label: string; permissions: string[] }[];
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "inspector" as RoleName,
    is_active: true,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<UsersResponse>("/users"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "inspector", is_active: true });
    setOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role, is_active: user.is_active });
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          name: form.name,
          role: form.role,
          is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
        notify("success", `${form.name} updated`);
      } else {
        await api.post("/users", {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        });
        notify("success", `${form.name} created`);
      }
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save user");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: User) {
    try {
      if (user.is_active) {
        await api.delete(`/users/${user.id}`);
        notify("success", `${user.name} deactivated`);
      } else {
        await api.put(`/users/${user.id}`, { is_active: true });
        notify("success", `${user.name} reactivated`);
      }
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Update failed");
    }
  }

  const users = data?.items ?? [];

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Administration"
        title="User management"
        subtitle="Role-based access control for administrators, municipal officers and field inspectors."
        actions={
          <Button size="sm" onClick={openCreate} icon={<Plus size={14} />}>
            Add user
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={users.length} icon={<Shield size={16} />} tone="navy" />
        <StatCard label="Active accounts" value={users.filter((u) => u.is_active).length} icon={<UserCheck size={16} />} tone="success" />
        <StatCard label="Administrators" value={users.filter((u) => u.role === "admin").length} tone="purple" icon={<Shield size={16} />} />
        <StatCard label="Deactivated" value={users.filter((u) => !u.is_active).length} icon={<UserX size={16} />} tone="warning" />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title="Accounts" subtitle="Roles determine available permissions" />
        {loading ? (
          <LoadingBlock height="h-56" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState title="No users" description="Create the first account." />
        ) : (
          <div className="overflow-x-auto">
            <table className="uv-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last login</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-[10px] font-bold text-white">
                          {user.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-navy-900">{user.name}</p>
                          <p className="text-[10px] text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={user.role === "admin" ? "purple" : user.role === "officer" ? "accent" : "neutral"}>
                        {user.role_label ?? titleCase(user.role)}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={user.is_active ? "success" : "danger"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="text-[11px] text-slate-500">{formatDate(user.created_at)}</td>
                    <td className="text-[11px] text-slate-500">{user.last_login_at ? formatDate(user.last_login_at) : "Never"}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(user)}>
                          Edit
                        </Button>
                        {user.id !== currentUser?.id && (
                          <Button
                            size="sm"
                            variant={user.is_active ? "ghost" : "secondary"}
                            onClick={() => toggleActive(user)}
                          >
                            {user.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Role permissions" subtitle="Enforced by the backend on every endpoint" />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {(data?.roles ?? []).map((role) => (
            <div key={role.name} className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-navy-900">{role.label}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">{role.name}</p>
              <ul className="mt-2 space-y-1">
                {role.permissions.slice(0, 7).map((permission) => (
                  <li key={permission} className="text-[11px] text-slate-500">
                    · {permission.replace(":", " — ")}
                  </li>
                ))}
                {role.permissions.length > 7 && (
                  <li className="text-[10px] text-slate-400">+{role.permissions.length - 7} more</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add user"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={busy}>
              {editing ? "Save changes" : "Create user"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name">
            <input
              className="uv-input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Email address">
            <input
              className="uv-input"
              type="email"
              disabled={Boolean(editing)}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field
            label={editing ? "New password (optional)" : "Password"}
            hint="Minimum 8 characters"
          >
            <input
              className="uv-input"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className="uv-input"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as RoleName })}
            >
              <option value="inspector">Field Inspector</option>
              <option value="officer">Municipal Officer</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          {editing && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                className="rounded border-slate-300"
              />
              Account active
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
