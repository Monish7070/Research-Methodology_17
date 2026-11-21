import clsx from "clsx";
import { ArrowDownWideNarrow, Flame, Image as ImageIcon, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import JobSelector from "../components/JobSelector";
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
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import { api, queryString } from "../services/api";
import type { Detection } from "../types";

type ClassFilter = "all" | "crack" | "garbage" | "pothole";

export default function DetectionPage() {
  const [params, setParams] = useSearchParams();
  const initialJob = params.get("job") ? Number(params.get("job")) : null;
  const [jobId, setJobId] = useState<number | null>(initialJob);
  const [className, setClassName] = useState<ClassFilter>("all");
  const [minConfidence, setMinConfidence] = useState(0.25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("confidence");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  const pageSize = 24;
  const [data, setData] = useState<{
    total: number;
    counts: Record<string, number>;
    items: Detection[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<{
          total: number;
          counts: Record<string, number>;
          items: Detection[];
        }>(
          `/detections${queryString({
            class_name: className,
            job_id: jobId,
            min_confidence: minConfidence,
            search,
            sort_by: sortBy,
            sort_dir: sortDir,
            limit: pageSize,
            offset: page * pageSize,
          })}`,
        );
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load detections");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [className, jobId, minConfidence, search, sortBy, sortDir, page]);

  function updateJob(next: number | null) {
    setJobId(next);
    setPage(0);
    if (next) setParams({ job: String(next) });
    else setParams({});
  }

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Member 2 · YOLO11n"
        title="Object detection results"
        subtitle="Detections from the custom-trained three-class model (crack, garbage, pothole) with bounding boxes, confidence scores and annotated frames."
        actions={<JobSelector value={jobId} onChange={updateJob} />}
      />

      <Card className="mb-5">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={className}
              onChange={(id) => {
                setClassName(id);
                setPage(0);
              }}
              tabs={[
                { id: "all", label: "All", count: data?.counts.all },
                { id: "crack", label: "Cracks", count: data?.counts.crack },
                { id: "garbage", label: "Garbage", count: data?.counts.garbage },
                { id: "pothole", label: "Potholes", count: data?.counts.pothole },
              ]}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-52 rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent-500"
                  placeholder="Search frame filename"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div className="relative">
                <ArrowDownWideNarrow size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  className="appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-7 pr-6 text-xs font-medium text-slate-700 outline-none focus:border-accent-500"
                  value={`${sortBy}:${sortDir}`}
                  onChange={(event) => {
                    const [field, direction] = event.target.value.split(":");
                    setSortBy(field);
                    setSortDir(direction);
                  }}
                >
                  <option value="confidence:desc">Confidence ↓</option>
                  <option value="confidence:asc">Confidence ↑</option>
                  <option value="priority:desc">Priority ↓</option>
                  <option value="created_at:desc">Newest</option>
                  <option value="class_name:asc">Class A–Z</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Field label="" className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Min confidence
              </span>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                value={minConfidence}
                onChange={(event) => {
                  setMinConfidence(Number(event.target.value));
                  setPage(0);
                }}
                className="h-1.5 w-40 cursor-pointer accent-accent-600"
              />
              <span className="w-10 text-xs font-semibold tabular-nums text-navy-900">
                {(minConfidence * 100).toFixed(0)}%
              </span>
            </Field>
            <span className="text-xs text-slate-400">
              {data?.total ?? 0} detection{(data?.total ?? 0) === 1 ? "" : "s"} matched
            </span>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Loading detections…" height="h-72" />
      ) : error ? (
        <Card>
          <ErrorState message={error} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ImageIcon size={22} />}
            title="No detections matched"
            description="Adjust the class, confidence or search filters — or process new footage to generate detections."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((detection) => (
              <button
                key={detection.id}
                type="button"
                onClick={() => setOpenId(detection.id)}
                className="uv-card group overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative aspect-video bg-slate-900">
                  {detection.annotated_url || detection.image_url ? (
                    <img
                      src={detection.annotated_url ?? detection.image_url ?? ""}
                      alt={`${detection.class_name} detection`}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:opacity-95"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
                      image unavailable
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    <ClassBadge name={detection.class_name} />
                    {detection.has_explanation && (
                      <Badge tone="purple">
                        <Flame size={10} /> CAM
                      </Badge>
                    )}
                  </div>
                  <span className="absolute right-2 top-2 rounded-full bg-navy-950/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    {(detection.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-navy-900">{detection.defect_code}</p>
                    <PriorityBadge category={detection.priority?.category} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-400">{detection.frame_name}</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1">
                      <ProgressBar
                        value={detection.priority?.total_score ?? 0}
                        tone={
                          detection.priority?.category === "high"
                            ? "danger"
                            : detection.priority?.category === "medium"
                              ? "warning"
                              : "success"
                        }
                        height="h-1.5"
                      />
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-500">
                      {detection.priority ? detection.priority.total_score.toFixed(0) : "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <StatusBadge status={detection.maintenance_status} label={detection.maintenance_status_label} />
                    <span className="text-[10px] text-slate-400">Job #{detection.job_id}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DetectionModal detectionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

export function DetectionModal({
  detectionId,
  onClose,
}: {
  detectionId: number | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"annotated" | "original">("annotated");
  const { notify } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!detectionId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<Detection>(`/detections/${detectionId}`)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load detection");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detectionId]);

  async function generateExplanation() {
    if (!data) return;
    setBusy(true);
    try {
      await api.post(`/explainability/generate/${data.id}`);
      notify("success", "LayerCAM explanation generated");
      onClose();
      navigate(`/explainability?detection=${data.id}`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "LayerCAM generation failed");
    } finally {
      setBusy(false);
    }
  }

  const priority = data?.priority;
  const image = tab === "annotated" ? data?.annotated_url ?? data?.image_url : data?.image_url;

  return (
    <Modal
      open={Boolean(detectionId)}
      onClose={onClose}
      title={data ? `${data.defect_code} · ${data.class_name}` : "Detection details"}
      subtitle={data ? `${data.frame_name} · job #${data.job_id}` : undefined}
      width="max-w-4xl"
      footer={
        data && (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={generateExplanation}
              loading={busy}
              icon={<Sparkles size={13} />}
            >
              {data.has_explanation ? "Regenerate LayerCAM" : "Generate LayerCAM"}
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <LoadingBlock height="h-64" />
      ) : error ? (
        <ErrorState message={error} />
      ) : data ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "annotated", label: "Detection image" },
                  { id: "original", label: "Original keyframe" },
                ]}
              />
              <span className="text-[10px] text-slate-400">
                bbox [{data.bbox?.map((v) => v.toFixed(0)).join(", ") ?? "—"}]
              </span>
            </div>
            <div className="overflow-hidden rounded-xl bg-navy-950">
              {image ? (
                <img src={image} alt="Detection view" className="max-h-[420px] w-full object-contain" />
              ) : (
                <div className="flex h-64 items-center justify-center text-xs text-slate-500">
                  Image file unavailable
                </div>
              )}
            </div>
            {data.explanation?.overlay_url && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  LayerCAM overlay
                </p>
                <img
                  src={data.explanation.overlay_url}
                  alt="LayerCAM explanation"
                  className="w-full rounded-xl border border-slate-200"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Detection
                </span>
                <ClassBadge name={data.class_name} />
              </div>
              <dl className="mt-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Confidence</dt>
                  <dd className="font-semibold text-navy-900">{(data.confidence * 100).toFixed(2)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Source</dt>
                  <dd className="text-slate-600">{data.source}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Maintenance</dt>
                  <dd>
                    <StatusBadge status={data.maintenance_status} label={data.maintenance_status_label} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Location</dt>
                  <dd className="text-right text-slate-600">
                    {data.location
                      ? `${data.location.latitude.toFixed(5)}, ${data.location.longitude.toFixed(5)}`
                      : "Unavailable"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Maintenance priority
                </span>
                <PriorityBadge category={priority?.category} />
              </div>
              {priority ? (
                <>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-900">
                    {priority.total_score.toFixed(2)}
                    <span className="ml-1 text-xs font-normal text-slate-400">/ 100</span>
                  </p>
                  <div className="mt-3 space-y-2">
                    {[
                      ["Severity", priority.severity_contribution],
                      ["Confidence", priority.confidence_contribution],
                      ["Risk", priority.risk_contribution],
                      ["Location", priority.location_contribution],
                    ].map(([label, value]) => (
                      <div key={label as string} className="flex items-center gap-2">
                        <span className="w-20 text-[11px] text-slate-500">{label}</span>
                        <div className="flex-1">
                          <ProgressBar value={Number(value) * 2.5} tone="accent" height="h-1.5" />
                        </div>
                        <span className="w-9 text-right text-[10px] font-semibold tabular-nums text-slate-600">
                          {Number(value).toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-400">No priority score stored for this detection.</p>
              )}
            </div>

            {data.explanation && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                  LayerCAM summary
                </p>
                <dl className="mt-2 space-y-1 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <dt>Feature layer</dt>
                    <dd className="font-semibold">{data.explanation.feature_layer}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Prediction anchor</dt>
                    <dd className="font-semibold">{data.explanation.prediction_index}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Anchor IoU</dt>
                    <dd className="font-semibold">{data.explanation.matching_iou?.toFixed(3)}</dd>
                  </div>
                </dl>
                {data.explanation.warning && (
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-700">{data.explanation.warning}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
