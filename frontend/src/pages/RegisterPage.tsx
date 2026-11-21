import { ArrowRight, Lock, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Button, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { RoleName } from "../types";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "inspector" as RoleName,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password, form.role);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Request access to the municipal monitoring workspace."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-accent-600 hover:text-accent-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <div className="relative">
            <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="uv-input pl-9"
              required
              minLength={2}
              placeholder="Officer name"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </div>
        </Field>

        <Field label="Email address">
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="uv-input pl-9"
              type="email"
              required
              placeholder="you@municipality.gov"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Role"
          hint="Self-registration is limited to Field Inspector and Municipal Officer. Administrator accounts are created by an existing administrator in User Management."
        >
          <select
            className="uv-input"
            value={form.role}
            onChange={(event) => update("role", event.target.value)}
          >
            <option value="inspector">Field Inspector</option>
            <option value="officer">Municipal Officer</option>
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password">
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="uv-input pl-9"
                type="password"
                required
                minLength={8}
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
              />
            </div>
          </Field>
          <Field label="Confirm password">
            <input
              className="uv-input"
              type="password"
              required
              placeholder="Repeat password"
              value={form.confirm}
              onChange={(event) => update("confirm", event.target.value)}
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" loading={loading} icon={<ArrowRight size={16} />}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
