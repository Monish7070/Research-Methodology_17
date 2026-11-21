import { Clock, Film, Image as ImageIcon, Scissors, Settings2, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import JobSelector from "../components/JobSelector";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ImageLightbox,
  LoadingBlock,
  PageHeader,
  StatCard,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { Job, Keyframe } from "../types";
import { formatNumber, formatPercent, timeAgo } from "../utils/format";

interface KeyframeResponse {
  job: Job;
  extraction: {
    frames_read: number;
    keyframes_saved: number;
    frames_removed: number;
    reduction_percent: number;
    threshold: number | null;
    temporal_gap: number | null;
  };
  items: Keyframe[];
}

export default function KeyframesPage() {
  const [params, setParams] = useSearchParams();
  const jobParam = params.get("job");
  const [selectedJob, setSelectedJob] = useState<number | null>(jobParam ? Number(jobParam) : null);
  const [preview, setPreview] = useState<Keyframe | null>(null);

  const jobs = useApi<{ items: Job[] }>("/processing/jobs?limit=100");
  const activeJobId = selectedJob ?? jobs.data?.items?.[0]?.id ?? null;

  const data = useApi<KeyframeResponse>(activeJobId ? `/keyframes/job/${activeJobId}` : null, [activeJobId]);

  function changeJob(jobId: number | null) {
    setSelectedJob(jobId);
    if (jobId) setParams({ job: String(jobId) });
    else setParams({});
  }

  const extraction = data.data?.extraction;
  const keyframes = data.data?.items ?? [];
  const video = data.data?.job.video;

  const grouped = useMemo(() => keyframes, [keyframes]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Member 1 · SSIM"
        title="Keyframe extraction"
        subtitle="Content-aware frame selection removes temporally redundant video frames before detection. Only keyframes kept by the SSIM threshold are analysed downstream."
        actions={jobs.data?.items?.length ? <JobSelector value={activeJobId} onChange={changeJob} /> : undefined}
      />

      {!jobs.loading && !jobs.data?.items?.length ? (
        <Card>
          <EmptyState
            icon={<Film size={22} />}
            title="No processed footage yet"
            description="Upload a road-monitoring video and start the AI pipeline. Extraction statistics and the keyframe gallery will appear here."
          />
        </Card>
      ) : data.loading ? (
        <LoadingBlock label="Loading extraction results…" height="h-72" />
      ) : data.error ? (
        <Card>
          <ErrorState message={data.error} onRetry={data.reload} />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Frames read" value={formatNumber(extraction?.frames_read)} icon={<Video size={16} />} tone="navy" />
            <StatCard label="Keyframes extracted" value={formatNumber(extraction?.keyframes_saved)} icon={<Film size={16} />} tone="accent" />
            <StatCard label="Frames removed" value={formatNumber(extraction?.frames_removed)} icon={<Scissors size={16} />} tone="warning" />
            <StatCard label="Reduction" value={formatPercent(extraction?.reduction_percent, 2)} icon={<Scissors size={16} />} tone="success" />
            <StatCard
              label="Parameters"
              value={
                <span className="text-base">
                  {extraction?.threshold ?? "—"} <span className="text-xs font-normal text-slate-400">SSIM</span>
                </span>
              }
              hint={`Temporal gap ${extraction?.temporal_gap ?? "—"} frames`}
              icon={<Settings2 size={16} />}
              tone="purple"
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1.9fr]">
            <Card className="overflow-hidden">
              <CardHeader
                title="Original capture"
                subtitle={data.data?.job.video?.original_filename ?? "—"}
                action={<Badge tone="neutral">{data.data?.job.video?.media_type ?? "video"}</Badge>}
              />
              <div className="p-4">
                {video?.url ? (
                  video.media_type === "image" ? (
                    <img src={video.url} alt="Original uploaded capture" className="w-full rounded-xl object-contain" />
                  ) : (
                    <video src={video.url} controls preload="metadata" className="w-full rounded-xl bg-navy-950" />
                  )
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                    Source file unavailable
                  </div>
                )}
                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <dt className="text-slate-500">Job</dt>
                    <dd className="font-semibold text-navy-900">#{data.data?.job.id}</dd>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <dt className="text-slate-500">Status</dt>
                    <dd className="font-semibold text-navy-900">{data.data?.job.status}</dd>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-2">
                    <dt className="text-slate-500">Finished</dt>
                    <dd className="text-slate-600">{timeAgo(data.data?.job.finished_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Keyframe dimensions</dt>
                    <dd className="text-slate-600">
                      {keyframes[0]?.width ?? "—"} × {keyframes[0]?.height ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card>
              <CardHeader
                title={`Extracted keyframes (${keyframes.length})`}
                subtitle="Click any frame to view it in full size"
                action={<Badge tone="accent">{formatPercent(extraction?.reduction_percent, 2)} saved</Badge>}
              />
              {grouped.length === 0 ? (
                <EmptyState
                  icon={<ImageIcon size={22} />}
                  title="No keyframes stored"
                  description="This job has not produced keyframes. Check the processing status on the upload page."
                />
              ) : (
                <div className="grid max-h-[640px] grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {grouped.map((keyframe) => (
                    <button
                      key={keyframe.id}
                      type="button"
                      onClick={() => setPreview(keyframe)}
                      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left transition hover:border-accent-400 hover:shadow-md"
                    >
                      {keyframe.url ? (
                        <img
                          src={keyframe.url}
                          alt={`Keyframe ${keyframe.filename}`}
                          loading="lazy"
                          className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center text-[10px] text-slate-400">
                          missing file
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/80 to-transparent px-2 pb-1.5 pt-5">
                        <p className="truncate text-[10px] font-medium text-white">{keyframe.filename}</p>
                        <p className="flex items-center gap-1 text-[9px] text-slate-300">
                          <Clock size={9} /> {keyframe.timestamp_seconds.toFixed(2)}s · frame {keyframe.frame_index}
                        </p>
                      </div>
                      {keyframe.detection_count > 0 && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {keyframe.detection_count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <ImageLightbox
        src={preview?.url ?? null}
        caption={preview ? `${preview.filename} · t=${preview.timestamp_seconds.toFixed(2)}s · ${preview.width}×${preview.height}` : undefined}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
