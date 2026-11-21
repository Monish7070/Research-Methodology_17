import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  FileVideo2,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MinusCircle,
  Play,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import { api, uploadFile } from "../services/api";
import type { Job, Stage, Video } from "../types";
import { formatBytes, formatDuration, formatPercent, timeAgo } from "../utils/format";

const ACCEPT = ".mp4,.avi,.mov,.mkv,.m4v,.ts,.jpg,.jpeg,.png";
const MAX_MB = 2048;

interface StartOptions {
  threshold: number;
  temporal_gap: number;
  conf_threshold: number;
  max_layercam: number;
  frame_stride: number;
  image_size: number;
}

const DEFAULT_OPTIONS: StartOptions = {
  threshold: 0.92,
  temporal_gap: 10,
  conf_threshold: 0.25,
  max_layercam: 6,
  frame_stride: 1,
  image_size: 640,
};

function StageIcon({ status }: { status: Stage["status"] }) {
  if (status === "completed") return <Check size={13} strokeWidth={3} />;
  if (status === "running") return <Loader2 size={13} className="animate-spin" />;
  if (status === "failed") return <X size={13} strokeWidth={3} />;
  if (status === "skipped") return <MinusCircle size={13} />;
  return <Clock size={12} />;
}

const STAGE_TONE: Record<Stage["status"], string> = {
  completed: "bg-emerald-500 text-white",
  running: "bg-accent-500 text-white ring-4 ring-accent-100",
  failed: "bg-red-500 text-white",
  skipped: "bg-slate-300 text-white",
  pending: "bg-slate-100 text-slate-400",
};

export default function UploadPage() {
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploaded, setUploaded] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [locationLabel, setLocationLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [showLocation, setShowLocation] = useState(false);

  const [options, setOptions] = useState<StartOptions>(DEFAULT_OPTIONS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const [recent, setRecent] = useState<Video[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const response = await api.get<{ items: Video[] }>("/videos?limit=8");
      setRecent(response.items);
    } catch {
      /* non-critical */
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await api.get<Job>(`/processing/${job.id}/status`);
        setJob(status);
        setPollError(null);
        if (status.status === "completed") {
          notify("success", `Processing complete — ${status.detections_count} detections found`);
          loadRecent();
        }
        if (status.status === "failed") {
          notify("error", status.error_message ?? "Processing failed");
        }
      } catch (err) {
        setPollError(err instanceof Error ? err.message : "Lost connection to processing status");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, notify, loadRecent]);

  function pickFile(next: File | null) {
    setError(null);
    setJob(null);
    setUploaded(null);
    setUploadProgress(0);

    if (!next) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    const extension = `.${next.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ACCEPT.split(",").includes(extension)) {
      setError(`Unsupported file type "${extension}". Upload MP4, AVI, MOV, MKV, M4V, TS, JPG, JPEG or PNG.`);
      return;
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      setError(`File is ${formatBytes(next.size)}; the limit is ${MAX_MB} MB.`);
      return;
    }

    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fields: Record<string, string> = { location_label: locationLabel };
      if (latitude && longitude) {
        fields.latitude = latitude;
        fields.longitude = longitude;
      }
      const video = await uploadFile<Video>("/videos/upload", file, fields, setUploadProgress);
      setUploaded(video);
      notify("success", "Footage uploaded. Start the AI pipeline when ready.");
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onStartProcessing() {
    if (!uploaded) return;
    setStarting(true);
    setError(null);
    try {
      const created = await api.post<Job>(`/processing/start/${uploaded.id}`, options);
      setJob(created);
      notify("info", `Processing job #${created.id} started`);
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start processing");
    } finally {
      setStarting(false);
    }
  }

  async function deleteVideo(id: number) {
    if (!window.confirm("Delete this upload and its processing results? This cannot be undone.")) return;
    try {
      await api.delete(`/videos/${id}`);
      notify("success", "Upload deleted");
      if (uploaded?.id === id) {
        setUploaded(null);
        setFile(null);
        setPreviewUrl(null);
        setJob(null);
      }
      loadRecent();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Delete failed");
    }
  }

  const fileIsVideo = file ? !/\.(jpe?g|png)$/i.test(file.name) : true;
  const active = job && ["queued", "running"].includes(job.status);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Acquisition"
        title="Video &amp; image upload"
        subtitle="Ingest municipal vehicle footage, then run SSIM keyframe extraction, YOLO11n detection, LayerCAM explanation and priority scoring."
        actions={
          <Link to="/history" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
            View processing history →
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader
              title="1. Select footage"
              subtitle="MP4, AVI, MOV, MKV, M4V, TS, JPG, JPEG, PNG · up to 2 GB"
              action={
                <Badge tone="accent">
                  <Sparkles size={11} /> AI ready
                </Badge>
              }
            />
            <div className="p-5">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pickFile(event.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => inputRef.current?.click()}
                className={clsx(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
                  dragging
                    ? "border-accent-400 bg-accent-50/60"
                    : "border-slate-200 bg-slate-50/60 hover:border-accent-300 hover:bg-accent-50/40",
                )}
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-accent-600 shadow-sm">
                  <UploadCloud size={22} />
                </div>
                <p className="text-sm font-semibold text-navy-900">
                  Drag &amp; drop footage, or click to browse
                </p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Road-monitoring video from a municipal vehicle camera, or a single road image.
                </p>
                <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  MP4 · AVI · MOV · MKV · M4V · TS · JPG · JPEG · PNG
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />
              </div>

              {file && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white">
                      {fileIsVideo ? <FileVideo2 size={19} /> : <ImageIcon size={19} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-900">{file.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatBytes(file.size)} · {file.type || "unknown type"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => pickFile(null)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Remove selected file"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {previewUrl && (
                    <div className="mt-4 overflow-hidden rounded-xl bg-navy-950">
                      {fileIsVideo ? (
                        <video src={previewUrl} controls className="max-h-64 w-full" preload="metadata" />
                      ) : (
                        <img src={previewUrl} alt="Selected road frame preview" className="max-h-72 w-full object-contain" />
                      )}
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowLocation((value) => !value)}
                      className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      <span className="inline-flex items-center gap-2">
                        <MapPin size={13} /> Optional: record a verified collection location
                      </span>
                      <ChevronDown size={14} className={clsx("transition", showLocation && "rotate-180")} />
                    </button>
                    {showLocation && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Location label" className="sm:col-span-3">
                          <input
                            className="uv-input"
                            placeholder="e.g. Avinashi Road, Coimbatore"
                            value={locationLabel}
                            onChange={(event) => setLocationLabel(event.target.value)}
                          />
                        </Field>
                        <Field label="Latitude">
                          <input
                            className="uv-input"
                            type="number"
                            step="0.000001"
                            placeholder="11.0168"
                            value={latitude}
                            onChange={(event) => setLatitude(event.target.value)}
                          />
                        </Field>
                        <Field label="Longitude">
                          <input
                            className="uv-input"
                            type="number"
                            step="0.000001"
                            placeholder="76.9558"
                            value={longitude}
                            onChange={(event) => setLongitude(event.target.value)}
                          />
                        </Field>
                        <p className="self-end text-[10px] leading-relaxed text-slate-400 sm:col-span-1">
                          Coordinates are only used when you enter them. Nothing is inferred from the image.
                        </p>
                      </div>
                    )}
                  </div>

                  {uploading && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex justify-between text-[11px] font-medium text-slate-500">
                        <span>Uploading…</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <ProgressBar value={uploadProgress} />
                    </div>
                  )}

                  <Button
                    className="mt-4 w-full"
                    onClick={onUpload}
                    loading={uploading}
                    disabled={Boolean(uploaded)}
                    icon={<UploadCloud size={16} />}
                  >
                    {uploaded ? "Footage uploaded" : "Upload footage"}
                  </Button>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="2. Run the AI pipeline"
              subtitle="Stages execute on the Python backend with the trained YOLO11n model"
              action={
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Parameters <ChevronDown size={14} className={clsx("transition", showAdvanced && "rotate-180")} />
                </button>
              }
            />
            <div className="p-5">
              {showAdvanced && (
                <div className="mb-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
                  <Field label="SSIM threshold" hint="Lower keeps more frames (default 0.92)">
                    <input
                      className="uv-input"
                      type="number"
                      step="0.01"
                      min="0.5"
                      max="0.999"
                      value={options.threshold}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, threshold: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label="Temporal gap (frames)" hint="Minimum spacing between keyframes">
                    <input
                      className="uv-input"
                      type="number"
                      min="1"
                      max="120"
                      value={options.temporal_gap}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, temporal_gap: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label="Detection confidence" hint="YOLO confidence threshold (default 0.25)">
                    <input
                      className="uv-input"
                      type="number"
                      step="0.01"
                      min="0.05"
                      max="0.95"
                      value={options.conf_threshold}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, conf_threshold: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label="LayerCAM explanations" hint="Highest-confidence detections explained automatically">
                    <input
                      className="uv-input"
                      type="number"
                      min="0"
                      max="50"
                      value={options.max_layercam}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, max_layercam: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field
                    label="Frame sampling stride"
                    hint="Compare every Nth frame. Use 2–5 for long bus/lorry shift recordings."
                  >
                    <input
                      className="uv-input"
                      type="number"
                      min="1"
                      max="60"
                      value={options.frame_stride}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, frame_stride: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field
                    label="Inference resolution (px)"
                    hint="Raise to 960–1280 for wide-angle HD/4K footage so small defects are not lost."
                  >
                    <select
                      className="uv-input"
                      value={options.image_size}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, image_size: Number(event.target.value) }))
                      }
                    >
                      <option value={640}>640 (default)</option>
                      <option value={960}>960</option>
                      <option value={1280}>1280</option>
                    </select>
                  </Field>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={onStartProcessing}
                  loading={starting}
                  disabled={!uploaded || Boolean(active) || job?.status === "completed"}
                  icon={<Play size={15} />}
                >
                  {job?.status === "completed" ? "Processing completed" : "Start AI processing"}
                </Button>
                {!uploaded && <span className="text-xs text-slate-400">Upload footage first.</span>}
                {uploaded && !job && (
                  <span className="text-xs text-slate-400">
                    Model: <span className="font-medium text-slate-600">YOLO11n · crack / garbage / pothole</span>
                  </span>
                )}
                {pollError && <span className="text-xs text-red-600">{pollError}</span>}
              </div>

              {!job ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Pipeline stages
                  </p>
                  <ol className="mt-3 space-y-2 text-xs text-slate-500">
                    {[
                      "Video uploaded",
                      "SSIM keyframe extraction",
                      "YOLO object detection",
                      "LayerCAM explanation generation",
                      "Maintenance priority calculation",
                      "Database storage",
                      "Report generation",
                    ].map((label, index) => (
                      <li key={label} className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500">
                          {index + 1}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-navy-900">
                      Job #{job.id} · {job.status === "running" ? "Processing" : job.status}
                    </span>
                    <span className="tabular-nums text-slate-500">{job.progress}%</span>
                  </div>
                  <ProgressBar
                    value={job.progress}
                    tone={job.status === "failed" ? "danger" : job.status === "completed" ? "success" : "accent"}
                  />
                  <ol className="mt-4 space-y-3">
                    {(job.stages ?? []).map((stage) => (
                      <li key={stage.key} className="flex items-start gap-3">
                        <span
                          className={clsx(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            STAGE_TONE[stage.status],
                          )}
                        >
                          <StageIcon status={stage.status} />
                        </span>
                        <div className="min-w-0">
                          <p
                            className={clsx(
                              "text-xs font-semibold",
                              stage.status === "pending" ? "text-slate-400" : "text-navy-900",
                            )}
                          >
                            {stage.label}
                          </p>
                          {stage.message && (
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{stage.message}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                  {job.status === "failed" && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
                      <p className="font-semibold">Processing failed</p>
                      <p className="mt-1 leading-relaxed">{job.error_message}</p>
                    </div>
                  )}

                  {job.status === "completed" && (
                    <>
                      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <StatCard label="Frames read" value={job.frames_read} tone="navy" />
                        <StatCard label="Keyframes" value={job.keyframes_saved} tone="accent" />
                        <StatCard
                          label="Reduction"
                          value={formatPercent(job.reduction_percent)}
                          tone="success"
                        />
                        <StatCard label="Detections" value={job.detections_count} tone="purple" />
                        <StatCard label="High priority" value={job.high_priority_count} tone="danger" />
                        <StatCard label="Explanations" value={job.layercam_count} tone="warning" />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          to={`/keyframes?job=${job.id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View keyframes
                        </Link>
                        <Link
                          to={`/detection?job=${job.id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View detections
                        </Link>
                        <Link
                          to={`/explainability?job=${job.id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View explanations
                        </Link>
                        <Link
                          to="/reports"
                          className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-800"
                        >
                          Download report
                        </Link>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400">
                        Processing time {formatDuration(job.duration_seconds)} · finished{" "}
                        {job.finished_at ? timeAgo(job.finished_at) : "—"}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Uploaded footage" subtitle="Most recent eight captures" action={
              <button
                type="button"
                onClick={loadRecent}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Refresh uploads"
              >
                <RefreshCw size={14} />
              </button>
            } />
            {recentLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-14 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : recent.length ? (
              <ul className="divide-y divide-slate-100">
                {recent.map((video) => (
                  <li key={video.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        {video.media_type === "image" ? <ImageIcon size={15} /> : <FileVideo2 size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-navy-900">{video.original_filename}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatBytes(video.size_bytes)}
                          {video.duration_seconds ? ` · ${formatDuration(video.duration_seconds)}` : ""} ·{" "}
                          {timeAgo(video.uploaded_at)}
                        </p>
                      </div>
                      <StatusBadge status={video.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-3 pl-11">
                      {video.latest_job_id && (
                        <Link
                          to={`/keyframes?job=${video.latest_job_id}`}
                          className="text-[11px] font-medium text-accent-600 hover:text-accent-700"
                        >
                          Job #{video.latest_job_id}
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteVideo(video.id)}
                        className="text-[11px] font-medium text-slate-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No footage yet"
                description="Your uploads will appear here with their processing status."
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Processing notes" subtitle="How the pipeline runs" />
            <div className="space-y-3 px-5 py-4 text-xs leading-relaxed text-slate-500">
              <p className="flex gap-2">
                <Cpu size={14} className="mt-0.5 shrink-0 text-accent-500" />
                The YOLO11n model is loaded once per backend worker and reused for every job.
              </p>
              <p className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                Processing runs in a background worker. This page polls the stored job status, so no
                stage is ever marked complete before the backend finishes it.
              </p>
              <p className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                LayerCAM is generated automatically for the highest-confidence detections
                (configurable). Generate explanations for any other detection from the Explainability page.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
