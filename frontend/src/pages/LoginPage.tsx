import { ArrowRight, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Button, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const DEMO_ACCOUNTS = [
  { label: "Administrator", email: "admin@urbanvision.ai" },
  { label: "Municipal Officer", email: "officer@urbanvision.ai" },
  { label: "Field Inspector", email: "inspector@urbanvision.ai" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      const target = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function useDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("Urban@123");
    setError(null);
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access the municipal infrastructure monitoring workspace."
      footer={
        <>
          New to the platform?{" "}
          <Link to="/register" className="font-semibold text-accent-600 hover:text-accent-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email address">
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="uv-input pl-9"
              type="email"
              autoComplete="email"
              required
              placeholder="you@municipality.gov"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </Field>

        <Field label="Password">
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="uv-input pl-9"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </Field>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="font-medium text-accent-600 hover:text-accent-700">
            Forgot password?
          </Link>
          <span className="text-slate-400">Protected municipal workspace</span>
        </div>

        <Button type="submit" className="w-full" loading={loading} icon={<ArrowRight size={16} />}>
          Sign in
        </Button>
      </form>

      <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Demo accounts (development)
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Password for all demo accounts: <span className="font-mono text-slate-600">Urban@123</span>
        </p>
        <div className="mt-3 grid gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => useDemo(account.email)}
              className="flex items-center justify-between rounded-lg border border-transparent px-2 py-1.5 text-left text-xs transition hover:border-slate-200 hover:bg-slate-50"
            >
              <span className="font-medium text-slate-600">{account.label}</span>
              <span className="font-mono text-[11px] text-slate-400">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
