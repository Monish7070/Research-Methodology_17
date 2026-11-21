import {
  Brain,
  CheckCircle2,
  Database,
  FolderOpen,
  Gauge,
  Save,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  LoadingBlock,
  PageHeader,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import type { PriorityConfig, SystemStatus } from "../types";

interface SettingsResponse {
  priority_config: PriorityConfig;
  settings: { key: string; value: unknown; description: string; updated_at: string | null; updated_by: string | null }[];
  environment: Record<string, string | number | boolean>;
}

export default function SettingsPage() {
  const { notify } = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organisation, setOrganisation] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, statusResponse] = await Promise.all([
        api.get<SettingsResponse>("/settings"),
        api.get<SystemStatus>("/system/status"),
      ]);
      setData(settingsResponse);
      setStatus(statusResponse);
      const organisationRow = settingsResponse.settings.find((row) => row.key === "organisation");
      setOrganisation(
        typeof organisationRow?.value === "string"
          ? organisationRow.value
          : ((organisationRow?.value as { name?: string } | undefined)?.name ?? ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveOrganisation() {
    setSaving(true);
    try {
      await api.put("/settings", { key: "organisation", value: { name: organisation } });
      notify("success", "Organisation setting saved");
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save setting");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock height="h-96" label="Loading system settings…" />;
  if (error) return <Card><ErrorState message={error} onRetry={load} /></Card>;

  const model = status?.model;
  const pipeline = status?.pipeline ?? {};

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        subtitle="Model configuration, pipeline defaults and priority scoring rules. Values are read from the backend environment and database."
        actions={
          <Button variant="secondary" size="sm" onClick={load} icon={<Settings2 size={13} />}>
            Reload configuration
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="AI model"
            subtitle="Custom-trained YOLO11n detector"
            action={
              <Badge tone={model?.exists ? "success" : "danger"}>
                {model?.exists ? "Weights present" : "Weights missing"}
              </Badge>
            }
          />
          <div className="space-y-3 px-5 py-4 text-xs">
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
              <Brain size={16} className="mt-0.5 shrink-0 text-accent-600" />
              <div className="min-w-0">
                <p className="font-semibold text-navy-900">Weights path</p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{model?.weights_path}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Classes</p>
                <p className="mt-0.5 font-semibold text-navy-900">{model?.classes.join(", ") || "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Device</p>
                <p className="mt-0.5 font-semibold text-navy-900">{model?.device ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Weights size</p>
                <p className="mt-0.5 font-semibold text-navy-900">{model?.size_mb ?? "—"} MB</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Loaded in worker</p>
                <p className="mt-0.5 font-semibold text-navy-900">{model?.loaded ? "Yes" : "Not yet"}</p>
              </div>
            </div>
            {!model?.exists && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                Place the trained best.pt at the configured path or update YOLO_WEIGHTS in backend/.env.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pipeline defaults" subtitle="Applied to new processing jobs" />
          <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs">
            {Object.entries(pipeline).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{key.replace(/_/g, " ")}</p>
                <p className="mt-0.5 font-semibold text-navy-900">{String(value)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Storage" subtitle="Server filesystem locations" />
          <div className="space-y-2 px-5 py-4 text-xs">
            {Object.entries(status?.storage ?? {}).map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3 border-b border-slate-50 pb-1.5">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <FolderOpen size={12} /> {key.replace(/_/g, " ")}
                </span>
                <span className="max-w-[60%] break-all text-right font-mono text-[10px] text-slate-600">
                  {String(value)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Database size={12} /> database
              </span>
              <span className="font-mono text-[10px] text-slate-600">{status?.app.database}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Priority scoring"
            subtitle="Weighted multi-criteria model"
            action={
              <Link to="/priority" className="text-xs font-semibold text-accent-600">
                Open editor →
              </Link>
            }
          />
          <div className="space-y-3 px-5 py-4">
            {data && (
              <>
                {Object.entries(data.priority_config.weights).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-slate-500">{key}</span>
                    <span className="font-semibold tabular-nums text-navy-900">{(value * 100).toFixed(0)}%</span>
                  </div>
                ))}
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                  <Gauge size={13} className="shrink-0" />
                  Categories: Low 0–{data.priority_config.categories.low_max}, Medium{" "}
                  {data.priority_config.categories.low_max + 1}–{data.priority_config.categories.medium_max}, High{" "}
                  {data.priority_config.categories.medium_max + 1}–100. Administrators can edit the weights,
                  component definitions and thresholds.
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Organisation" subtitle="Shown in exported report headers" />
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end">
            <Field label="Municipal body / department" className="flex-1">
              <input
                className="uv-input"
                placeholder="e.g. Coimbatore City Municipal Corporation"
                value={organisation}
                onChange={(event) => setOrganisation(event.target.value)}
              />
            </Field>
            <Button onClick={saveOrganisation} loading={saving} icon={<Save size={14} />}>
              Save setting
            </Button>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="System information" subtitle="Deployment and access control" />
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                <ShieldCheck size={12} /> Application
              </p>
              <p className="mt-1 text-xs font-semibold text-navy-900">{status?.app.name}</p>
              <p className="text-[10px] text-slate-400">v{status?.app.version}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                <CheckCircle2 size={12} /> Records
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {status?.counts.users ?? 0} users · {status?.counts.videos ?? 0} videos ·{" "}
                {status?.counts.jobs ?? 0} jobs · {status?.counts.detections ?? 0} detections
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                <Settings2 size={12} /> API
              </p>
              <p className="mt-1 text-xs text-slate-600">
                <a href="/api/docs" target="_blank" rel="noreferrer" className="font-semibold text-accent-600">
                  Interactive API documentation
                </a>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
