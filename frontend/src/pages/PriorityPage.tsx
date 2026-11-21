import { AlertTriangle, Calculator, Scale, Settings2, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { DetectionModal } from "./DetectionPage";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ClassBadge,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  PriorityBadge,
  ProgressBar,
  StatCard,
  Tabs,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, queryString } from "../services/api";
import type { Detection, Priority, PriorityConfig } from "../types";

interface PriorityItem extends Priority {
  detection: Detection;
}

interface PriorityResponse {
  total: number;
  distribution: { low: number; medium: number; high: number };
  config: PriorityConfig;
  items: PriorityItem[];
}

const WEIGHT_LABELS: Record<string, string> = {
  severity: "Severity (S)",
  confidence: "Confidence (C)",
  risk: "Risk (R)",
  location: "Location (L)",
};

export default function PriorityPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [category, setCategory] = useState<"all" | "high" | "medium" | "low">("all");
  const [className, setClassName] = useState("all");
  const [data, setData] = useState<PriorityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [draft, setDraft] = useState<PriorityConfig | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<PriorityResponse>(
        `/priority${queryString({ category, class_name: className, limit: 150 })}`,
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load priority scores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, className]);

  function openConfig() {
    setDraft(data?.config ? JSON.parse(JSON.stringify(data.config)) : null);
    setConfigOpen(true);
  }

  async function saveConfig() {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await api.put<{ message: string }>("/priority/settings", draft);
      notify("success", response.message);
      setConfigOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save configuration");
    } finally {
      setSaving(false);
    }
  }

  async function recalculate() {
    setRecalculating(true);
    try {
      const response = await api.post<{ message: string }>("/priority/recalculate", {});
      notify("success", response.message);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      setRecalculating(false);
    }
  }

  const config = data?.config;
  const totalWeight = config ? Object.values(config.weights).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Member 4 · Weighted scoring"
        title="Maintenance priority analysis"
        subtitle="Priority combines configurable severity, detection confidence, safety risk and verified location information into a single 0–100 maintenance score."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={recalculate} loading={recalculating} icon={<Calculator size={14} />}>
              Recalculate all
            </Button>
            {can("priority:configure") && (
              <Button size="sm" onClick={openConfig} icon={<SlidersHorizontal size={14} />}>
                Edit scoring rules
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Scored detections"
          value={data?.total ?? "—"}
          hint="Detections with a stored priority score"
          icon={<Scale size={16} />}
          tone="navy"
        />
        <StatCard label="High priority" value={data?.distribution.high ?? "—"} hint="Score 70 – 100" tone="danger" icon={<AlertTriangle size={16} />} />
        <StatCard label="Medium priority" value={data?.distribution.medium ?? "—"} hint="Score 40 – 69" tone="warning" icon={<Scale size={16} />} />
        <StatCard label="Low priority" value={data?.distribution.low ?? "—"} hint="Score 0 – 39" tone="success" icon={<Scale size={16} />} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Priority scoring table"
            subtitle="Contribution of each weighted component per detection"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-accent-500"
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                >
                  <option value="all">All classes</option>
                  <option value="crack">Crack</option>
                  <option value="garbage">Garbage</option>
                  <option value="pothole">Pothole</option>
                </select>
                <Tabs
                  value={category}
                  onChange={setCategory}
                  tabs={[
                    { id: "all", label: "All" },
                    { id: "high", label: "High" },
                    { id: "medium", label: "Medium" },
                    { id: "low", label: "Low" },
                  ]}
                />
              </div>
            }
          />

          {loading ? (
            <LoadingBlock height="h-64" />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !data?.items.length ? (
            <EmptyState
              title="No scored detections"
              description="Priority scores are created automatically when a processing job completes."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="uv-table">
                <thead>
                  <tr>
                    <th>Defect</th>
                    <th>Class</th>
                    <th className="text-right">Score</th>
                    <th>Category</th>
                    <th className="min-w-[220px]">Contribution breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr
                      key={item.detection_id}
                      className="cursor-pointer"
                      onClick={() => setOpenId(item.detection_id)}
                    >
                      <td>
                        <p className="font-semibold text-navy-900">{item.detection.defect_code}</p>
                        <p className="max-w-[190px] truncate text-[10px] text-slate-400">
                          {item.detection.frame_name}
                        </p>
                      </td>
                      <td>
                        <ClassBadge name={item.detection.class_name} />
                      </td>
                      <td className="text-right">
                        <span className="text-sm font-semibold tabular-nums text-navy-900">
                          {item.total_score.toFixed(1)}
                        </span>
                      </td>
                      <td>
                        <PriorityBadge category={item.category} />
                      </td>
                      <td>
                        <div className="space-y-1">
                          {[
                            ["S", item.severity_contribution, "#0ea5e9"],
                            ["C", item.confidence_contribution, "#8b5cf6"],
                            ["R", item.risk_contribution, "#f59e0b"],
                            ["L", item.location_contribution, "#10b981"],
                          ].map(([label, value, color]) => (
                            <div key={label as string} className="flex items-center gap-1.5">
                              <span className="w-3 text-[9px] font-bold text-slate-400">{label}</span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(100, Number(value) * 2.5)}%`, background: color as string }}
                                />
                              </div>
                              <span className="w-7 text-right text-[9px] tabular-nums text-slate-500">
                                {Number(value).toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Scoring model"
              subtitle="P = 100 × (0.40S + 0.20C + 0.25R + 0.15L)"
              action={<Badge tone="accent">{totalWeight.toFixed(2)} total</Badge>}
            />
            <div className="space-y-3 px-4 py-4">
              {config &&
                Object.entries(config.weights).map(([key, weight]) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="font-medium text-slate-600">{WEIGHT_LABELS[key] ?? key}</span>
                      <span className="font-semibold tabular-nums text-navy-900">{(weight * 100).toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={weight * 250} tone="navy" height="h-1.5" />
                  </div>
                ))}
              {config && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Class severity / risk
                  </p>
                  {Object.keys(config.class_severity).map((name) => (
                    <div key={name} className="flex items-center justify-between text-[11px]">
                      <ClassBadge name={name} />
                      <span className="text-slate-500">
                        S {config.class_severity[name].toFixed(2)} · R {(config.class_risk[name] ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-500">
                {config?.notes ??
                  "Severity and risk are configurable per-class values. Location reflects verification status."}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Category thresholds" subtitle="Initial project thresholds" />
            <div className="space-y-2 px-4 py-4 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                <span className="font-semibold">Low</span>
                <span>0 – {config?.categories.low_max ?? 39}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                <span className="font-semibold">Medium</span>
                <span>
                  {(config?.categories.low_max ?? 39) + 1} – {config?.categories.medium_max ?? 69}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-red-700">
                <span className="font-semibold">High</span>
                <span>{(config?.categories.medium_max ?? 69) + 1} – 100</span>
              </div>
              <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
                Thresholds are project settings, not universal standards. Administrators can adjust them.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <DetectionModal detectionId={openId} onClose={() => setOpenId(null)} />

      <Modal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Edit priority scoring rules"
        subtitle="Weights must sum to 1.0 · all component values are normalized to 0–1"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfigOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveConfig} loading={saving} icon={<Settings2 size={13} />}>
              Save &amp; recalculate
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Weights</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(draft.weights).map(([key, value]) => (
                  <Field key={key} label={WEIGHT_LABELS[key] ?? key}>
                    <input
                      className="uv-input"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={value}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          weights: { ...draft.weights, [key]: Number(event.target.value) },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Current sum: {Object.values(draft.weights).reduce((a, b) => a + b, 0).toFixed(2)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Severity per class
                </p>
                {Object.entries(draft.class_severity).map(([name, value]) => (
                  <Field key={name} label={name} className="mb-2">
                    <input
                      className="uv-input"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={value}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          class_severity: { ...draft.class_severity, [name]: Number(event.target.value) },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Safety risk per class
                </p>
                {Object.entries(draft.class_risk).map(([name, value]) => (
                  <Field key={name} label={name} className="mb-2">
                    <input
                      className="uv-input"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={value}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          class_risk: { ...draft.class_risk, [name]: Number(event.target.value) },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Location component
              </p>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(draft.location).map(([key, value]) => (
                  <Field key={key} label={key.replace(/_/g, " ")}>
                    <input
                      className="uv-input"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={value}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          location: { ...draft.location, [key]: Number(event.target.value) },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Category thresholds
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Low maximum">
                  <input
                    className="uv-input"
                    type="number"
                    min="0"
                    max="98"
                    value={draft.categories.low_max}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        categories: { ...draft.categories, low_max: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
                <Field label="Medium maximum">
                  <input
                    className="uv-input"
                    type="number"
                    min="1"
                    max="99"
                    value={draft.categories.medium_max}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        categories: { ...draft.categories, medium_max: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Saving recalculates every stored priority score immediately. These values are provisional
              project settings until field-measured definitions are supplied.
            </p>
          </div>
        ) : (
          <LoadingBlock />
        )}
      </Modal>
    </div>
  );
}
