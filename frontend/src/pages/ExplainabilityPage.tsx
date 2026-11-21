import clsx from "clsx";
import { Flame, Info, Layers, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import JobSelector from "../components/JobSelector";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ClassBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Tabs,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import type { Detection, Explanation } from "../types";

interface ExplainResponse {
  detection: Detection;
  explanation: Explanation | null;
}

export default function ExplainabilityPage() {
  const [params, setParams] = useSearchParams();
  const initialJob = params.get("job") ? Number(params.get("job")) : null;
  const [jobId, setJobId] = useState<number | null>(initialJob);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    params.get("detection") ? Number(params.get("detection")) : null,
  );
  const [payload, setPayload] = useState<ExplainResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(52);
  const [view, setView] = useState<"compare" | "overlay" | "raw" | "detection">("compare");
  const { notify } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    api
      .get<{ items: Detection[] }>(`/detections?limit=120&sort_by=confidence&sort_dir=desc${jobId ? `&job_id=${jobId}` : ""}`)
      .then((response) => {
        if (cancelled) return;
        setDetections(response.items);
        setSelectedId((current) => {
          if (current && response.items.some((item) => item.id === current)) return current;
          const explained = response.items.find((item) => item.has_explanation);
          return (explained ?? response.items[0])?.id ?? null;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load detections");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!selectedId) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    api
      .get<ExplainResponse>(`/explainability/${selectedId}`)
      .then((response) => {
        if (!cancelled) setPayload(response);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load explanation");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function generate() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const response = await api.post<{ explanation: Explanation; detection: Detection }>(
        `/explainability/generate/${selectedId}`,
      );
      setPayload({ detection: response.detection, explanation: response.explanation });
      setDetections((current) =>
        current.map((item) =>
          item.id === selectedId ? { ...item, has_explanation: true, explanation: response.explanation } : item,
        ),
      );
      notify("success", "LayerCAM explanation generated from the trained model");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "LayerCAM generation failed");
    } finally {
      setBusy(false);
    }
  }

  function changeJob(next: number | null) {
    setJobId(next);
    if (next) setParams({ job: String(next) });
    else setParams({});
  }

  const explanation = payload?.explanation;
  const detection = payload?.detection;
  const selected = detections.find((item) => item.id === selectedId);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Member 3 · LayerCAM"
        title="Explainable AI"
        subtitle="Every heatmap is computed from gradients of the actual selected prediction anchor. LayerCAM keeps spatially varying positive gradients instead of averaging them into channel weights."
        actions={<JobSelector value={jobId} onChange={changeJob} />}
      />

      {error && (
        <Card className="mb-5">
          <ErrorState message={error} />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card className="flex max-h-[780px] flex-col overflow-hidden">
          <CardHeader
            title="Detections"
            subtitle={`${detections.length} candidates`}
            action={<Badge tone="neutral">{detections.filter((d) => d.has_explanation).length} explained</Badge>}
          />
          {loadingList ? (
            <LoadingBlock height="h-64" />
          ) : detections.length === 0 ? (
            <EmptyState title="No detections" description="Process footage first." />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {detections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={clsx(
                    "flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition",
                    selectedId === item.id ? "bg-accent-50/70" : "hover:bg-slate-50",
                  )}
                >
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {item.annotated_url || item.image_url ? (
                      <img
                        src={item.annotated_url ?? item.image_url ?? ""}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-navy-900">
                      {item.defect_code}
                      <ClassBadge name={item.class_name} />
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.frame_name}</p>
                    <p className="text-[10px] font-medium text-slate-500">
                      {(item.confidence * 100).toFixed(1)}% confidence
                    </p>
                  </div>
                  {item.has_explanation ? (
                    <Flame size={14} className="shrink-0 text-violet-500" />
                  ) : (
                    <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-slate-300">
                      none
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          {loadingDetail ? (
            <Card>
              <LoadingBlock height="h-96" label="Loading explanation…" />
            </Card>
          ) : !detection ? (
            <Card>
              <EmptyState
                icon={<Flame size={22} />}
                title="Select a detection"
                description="Choose a detection from the list to inspect its LayerCAM explanation."
              />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader
                  title={`${detection.defect_code} · ${detection.class_name}`}
                  subtitle={`${detection.frame_name} · confidence ${(detection.confidence * 100).toFixed(2)}%`}
                  action={
                    <div className="flex items-center gap-2">
                      <Badge tone={explanation ? "purple" : "neutral"}>
                        {explanation ? "LayerCAM available" : "Not explained"}
                      </Badge>
                      <Button size="sm" onClick={generate} loading={busy} icon={<Sparkles size={13} />}>
                        {explanation ? "Regenerate" : "Generate"}
                      </Button>
                    </div>
                  }
                />
                <div className="p-4">
                  {!explanation ? (
                    <EmptyState
                      icon={<Layers size={22} />}
                      title="No explanation generated for this detection"
                      description="Generate a LayerCAM heatmap for this detection. The explanation is computed from the trained model, never synthesised."
                      action={
                        <Button onClick={generate} loading={busy} icon={<Sparkles size={14} />}>
                          Generate LayerCAM
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <Tabs
                          value={view}
                          onChange={setView}
                          tabs={[
                            { id: "compare", label: "Before / after" },
                            { id: "overlay", label: "LayerCAM overlay" },
                            { id: "raw", label: "Raw heatmap" },
                            { id: "detection", label: "Detection image" },
                          ]}
                        />
                        <span className="text-[10px] font-medium uppercase tracking-wider text-violet-600">
                          Method: LayerCAM · layer {explanation.feature_layer}
                        </span>
                      </div>

                      {view === "compare" ? (
                        <div>
                          <div className="relative select-none overflow-hidden rounded-xl bg-navy-950">
                            {explanation.original_url ? (
                              <img src={explanation.original_url} alt="Original keyframe" className="w-full" />
                            ) : null}
                            <div
                              className="absolute inset-0"
                              style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                            >
                              {explanation.overlay_url ? (
                                <img src={explanation.overlay_url} alt="LayerCAM overlay" className="h-full w-full" />
                              ) : null}
                            </div>
                            <div
                              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-lg"
                              style={{ left: `${compare}%` }}
                            >
                              <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-navy-900">
                                ⇄
                              </span>
                            </div>
                            <span className="absolute left-3 top-3 rounded-md bg-navy-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Original
                            </span>
                            <span className="absolute right-3 top-3 rounded-md bg-violet-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                              LayerCAM
                            </span>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <span className="text-[11px] font-medium text-slate-500">Comparison</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={compare}
                              onChange={(event) => setCompare(Number(event.target.value))}
                              className="h-1.5 flex-1 cursor-pointer accent-violet-600"
                            />
                            <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-slate-600">
                              {compare}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl bg-navy-950">
                          <img
                            src={
                              (view === "overlay"
                                ? explanation.overlay_url
                                : view === "raw"
                                  ? explanation.raw_cam_url
                                  : detection.annotated_url ?? detection.image_url) ?? ""
                            }
                            alt={`${view} view`}
                            className="max-h-[520px] w-full object-contain"
                          />
                        </div>
                      )}

                      {explanation.warning && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                          {explanation.warning}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>

              {explanation && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader title="Prediction mapping" subtitle="Anchor → detection" />
                    <dl className="space-y-2 px-4 py-3 text-xs">
                      {[
                        ["Prediction anchor", explanation.prediction_index],
                        ["Feature layer", explanation.feature_layer],
                        ["Feature shape", explanation.activation_shape?.join(" × ")],
                        ["Target score", explanation.target_score?.toFixed(4)],
                        ["Anchor IoU", explanation.matching_iou?.toFixed(3)],
                        ["Class fallback", explanation.class_match_fallback ? "Yes" : "No"],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between gap-3 border-b border-slate-50 pb-1.5">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="text-right font-semibold text-navy-900">{String(value ?? "—")}</dd>
                        </div>
                      ))}
                    </dl>
                  </Card>

                  <Card>
                    <CardHeader title="Gradient statistics" subtitle="Class-specific target score" />
                    <dl className="space-y-2 px-4 py-3 text-xs">
                      {[
                        ["Absolute mean", explanation.gradient_stats?.absolute_mean?.toExponential(3)],
                        ["Mean", explanation.gradient_stats?.mean?.toExponential(3)],
                        ["Max", explanation.gradient_stats?.max?.toExponential(3)],
                        ["Min", explanation.gradient_stats?.min?.toExponential(3)],
                        ["Positive elements", explanation.gradient_stats?.positive_elements],
                        ["Total elements", explanation.gradient_stats?.total_elements],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between gap-3 border-b border-slate-50 pb-1.5">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="text-right font-semibold tabular-nums text-navy-900">
                            {String(value ?? "—")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Card>

                  <Card>
                    <CardHeader title="Heatmap statistics" subtitle="Normalized 0–1 CAM" />
                    <dl className="space-y-2 px-4 py-3 text-xs">
                      {[
                        ["Max", explanation.heatmap_stats?.max?.toFixed(3)],
                        ["Mean", explanation.heatmap_stats?.mean?.toFixed(3)],
                        ["Std", explanation.heatmap_stats?.std?.toFixed(3)],
                        ["P90", explanation.heatmap_stats?.percentiles?.p90?.toFixed(3)],
                        ["P99", explanation.heatmap_stats?.percentiles?.p99?.toFixed(3)],
                        ["Inside-box max", explanation.bbox_stats?.box_cam_max?.toFixed(3)],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between gap-3 border-b border-slate-50 pb-1.5">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="text-right font-semibold tabular-nums text-navy-900">
                            {String(value ?? "—")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Card>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
                <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
                LayerCAM multiplies each activation by its spatially varying positive gradient, so the
                heatmap is not restricted to the box and may highlight context around the defect. It is
                not standard Grad-CAM, and a visible heatmap alone does not prove explanation validity.
              </div>
            </>
          )}
        </div>
      </div>

      {selected && !selected.has_explanation && (
        <p className="mt-4 text-[11px] text-slate-400">
          Tip: LayerCAM is generated automatically for the highest-confidence detections of each job.
        </p>
      )}
    </div>
  );
}
