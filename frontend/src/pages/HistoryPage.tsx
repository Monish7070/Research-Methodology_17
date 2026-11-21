import { Clock, Eye, FileText, Film, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, queryString } from "../services/api";
import type { Job } from "../types";
import { formatBytes, formatDateTime, formatDuration, formatPercent, timeAgo } from "../utils/format";

export default function HistoryPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Job | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ items: Job[] }>(
        `/processing/jobs${queryString({ status_filter: statusFilter === "all" ? undefined : statusFilter, limit: 200 })}`,
      );
      setJobs(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load processing history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const running = jobs.some((job) => ["queued", "running"].includes(job.status));
    if (!running) return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  async function remove(job: Job) {
    if (
      !window.confirm(
        `Delete processing job #${job.id} for "${job.video?.original_filename}" and all its keyframes, detections and explanations?`,
      )
    )
      return;
    try {
      await api.delete(`/processing/${job.id}`);
      notify("success", `Job #${job.id} deleted`);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function generateReport(job: Job) {
    try {
      const report = await api.post<{ id: number }>("/reports/generate", {
        report_type: "job",
        job_id: job.id,
      });
      notify("success", `Report #${report.id} generated — open Reports to download`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Report generation failed");
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Audit"
        title="Processing history"
        subtitle="Every processing job with extraction statistics, detection counts and high-priority cases."
        actions={
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="running">Running</option>
              <option value="queued">Queued</option>
              <option value="failed">Failed</option>
            </select>
            <Button variant="secondary" size="sm" onClick={load} icon={<RefreshCw size={13} />}>
              Refresh
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader title="Processing jobs" subtitle={`${jobs.length} job(s)`} />
        {loading ? (
          <LoadingBlock height="h-56" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<Film size={22} />}
            title="No processing jobs"
            description="Upload footage and start the AI pipeline to create the first processing job."
            action={
              <Link to="/upload" className="text-xs font-semibold text-accent-600">
                Upload footage
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="uv-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Video</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Keyframes</th>
                  <th>Detections</th>
                  <th>High priority</th>
                  <th>Duration</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <p className="font-semibold text-navy-900">#{job.id}</p>
                      <p className="text-[10px] text-slate-400">{job.created_by ?? "system"}</p>
                    </td>
                    <td>
                      <p className="max-w-[220px] truncate text-xs font-medium text-slate-700">
                        {job.video?.original_filename ?? `Video ${job.video_id}`}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {job.video?.media_type ?? "video"}
                        {job.video?.size_bytes ? ` · ${formatBytes(job.video.size_bytes)}` : ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-slate-500">
                      {formatDateTime(job.created_at)}
                      <p className="text-[10px] text-slate-400">{timeAgo(job.created_at)}</p>
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                      {["queued", "running"].includes(job.status) && (
                        <div className="mt-1 w-20">
                          <ProgressBar value={job.progress} height="h-1" />
                        </div>
                      )}
                      {job.error_message && (
                        <p className="mt-1 max-w-[160px] truncate text-[10px] text-red-500" title={job.error_message}>
                          {job.error_message}
                        </p>
                      )}
                    </td>
                    <td className="tabular-nums">
                      {job.keyframes_saved}
                      <span className="ml-1 text-[10px] text-slate-400">
                        /{job.frames_read} ({formatPercent(job.reduction_percent, 1)} saved)
                      </span>
                    </td>
                    <td className="tabular-nums">{job.detections_count}</td>
                    <td>
                      {job.high_priority_count > 0 ? (
                        <Badge tone="danger">{job.high_priority_count}</Badge>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-slate-500">
                      {formatDuration(job.duration_seconds)}
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDetail(job)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        <Link
                          to={`/keyframes?job=${job.id}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                          title="View keyframes"
                        >
                          <Film size={14} />
                        </Link>
                        <Link
                          to={`/detection?job=${job.id}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                          title="View detections"
                        >
                          <ScanSearch size={14} />
                        </Link>
                        <Link
                          to={`/explainability?job=${job.id}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                          title="View explanations"
                        >
                          <Clock size={14} />
                        </Link>
                        {job.status === "completed" && can("report:generate") && (
                          <button
                            type="button"
                            onClick={() => generateReport(job)}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
                            title="Generate report"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                        {can("video:delete") && (
                          <button
                            type="button"
                            onClick={() => remove(job)}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title="Delete job"
                          >
                            <Trash2 size={14} />
                          </button>
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

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Processing job #${detail.id}` : "Job"}
        subtitle={detail?.video?.original_filename}
        width="max-w-3xl"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Frames read", detail.frames_read],
                ["Keyframes", detail.keyframes_saved],
                ["Reduction", formatPercent(detail.reduction_percent, 2)],
                ["Detections", detail.detections_count],
                ["High priority", detail.high_priority_count],
                ["LayerCAM", detail.layercam_count],
                ["Duration", formatDuration(detail.duration_seconds)],
                ["SSIM / gap", `${detail.threshold ?? "—"} / ${detail.temporal_gap ?? "—"}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-navy-900">{String(value)}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200">
              <p className="border-b border-slate-100 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Pipeline stages
              </p>
              <ol className="divide-y divide-slate-100">
                {(detail.stages ?? []).map((stage) => (
                  <li key={stage.key} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                    <div>
                      <p className="text-[11px] font-semibold text-navy-900">{stage.label}</p>
                      <p className="text-[10px] text-slate-500">{stage.message || "—"}</p>
                    </div>
                    <StatusBadge status={stage.status} />
                  </li>
                ))}
              </ol>
            </div>

            {detail.error_message && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {detail.error_message}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                to={`/keyframes?job=${detail.id}`}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Keyframes
              </Link>
              <Link
                to={`/detection?job=${detail.id}`}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Detections
              </Link>
              <Link
                to={`/explainability?job=${detail.id}`}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Explanations
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
