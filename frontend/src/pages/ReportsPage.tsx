import { Download, FileSpreadsheet, FileText, Plus, RefreshCw } from "lucide-react";
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
  Tabs,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, getToken, queryString } from "../services/api";
import type { Job, Report } from "../types";
import { formatDateTime } from "../utils/format";

type ReportType = "defect" | "job" | "daily" | "weekly" | "monthly";

const TYPE_LABELS: Record<string, string> = {
  defect: "Individual defect",
  job: "Video processing",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export default function ReportsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [filter, setFilter] = useState<"all" | ReportType>("all");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [form, setForm] = useState<{
    report_type: ReportType;
    job_id: string;
    detection_id: string;
    start_date: string;
    end_date: string;
  }>({ report_type: "job", job_id: "", detection_id: "", start_date: "", end_date: "" });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ items: Report[] }>(
        `/reports${queryString({ report_type: filter, limit: 200 })}`,
      );
      setReports(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ items: Job[] }>("/processing/jobs?limit=100")
      .then((response) => {
        const completed = response.items.filter((job) => job.status === "completed");
        setJobs(completed);
        setForm((current) => ({
          ...current,
          job_id: current.job_id || (completed[0] ? String(completed[0].id) : ""),
        }));
      })
      .catch(() => setJobs([]));
  }, [open]);

  async function generate() {
    setGenerating(true);
    try {
      const payload: Record<string, unknown> = { report_type: form.report_type };
      if (form.report_type === "job") payload.job_id = Number(form.job_id);
      if (form.report_type === "defect") payload.detection_id = Number(form.detection_id);
      if (["daily", "weekly", "monthly"].includes(form.report_type)) {
        if (form.start_date) payload.start_date = form.start_date;
        if (form.end_date) payload.end_date = form.end_date;
      }
      const report = await api.post<Report>("/reports/generate", payload);
      notify("success", `Report #${report.id} generated`);
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function download(report: Report, format: "pdf" | "csv") {
    setDownloading(report.id);
    try {
      const response = await fetch(`/api/reports/download/${report.id}?format=${format}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!response.ok) {
        let detail = `Download failed (${response.status})`;
        try {
          const payload = await response.json();
          detail = payload.detail ?? detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${report.report_type}_report_${report.id}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Reporting"
        title="Reports &amp; exports"
        subtitle="Every report is generated from stored processing results — detections, priority scores, LayerCAM explanations and maintenance status."
        actions={
          can("report:generate") && (
            <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={14} />}>
              Generate report
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <CardHeader
          title="Generated reports"
          subtitle="PDF and CSV exports"
          action={
            <div className="flex items-center gap-2">
              <Tabs
                value={filter}
                onChange={setFilter}
                tabs={[
                  { id: "all", label: "All" },
                  { id: "job", label: "Processing" },
                  { id: "defect", label: "Defect" },
                  { id: "daily", label: "Daily" },
                  { id: "weekly", label: "Weekly" },
                  { id: "monthly", label: "Monthly" },
                ]}
              />
              <button
                type="button"
                onClick={load}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Refresh reports"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          }
        />

        {loading ? (
          <LoadingBlock height="h-56" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<FileText size={22} />}
            title="No reports yet"
            description="Processing reports are generated automatically when a job completes. You can also generate defect, daily, weekly and monthly reports."
            action={
              can("report:generate") ? (
                <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={13} />}>
                  Generate report
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="uv-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Period / source</th>
                  <th>Created</th>
                  <th className="text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <p className="font-semibold text-navy-900">{report.title}</p>
                      <p className="text-[10px] text-slate-400">
                        #{report.id} · {report.created_by ?? "system"}
                      </p>
                    </td>
                    <td>
                      <Badge tone={report.report_type === "job" ? "accent" : "purple"}>
                        {TYPE_LABELS[report.report_type] ?? report.report_type}
                      </Badge>
                    </td>
                    <td className="text-[11px] text-slate-500">
                      {report.period_start && report.period_end
                        ? `${formatDateTime(report.period_start)} → ${formatDateTime(report.period_end)}`
                        : report.job_id
                          ? `Job #${report.job_id}`
                          : report.detection_id
                            ? `Detection #${report.detection_id}`
                            : "—"}
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-slate-500">
                      {formatDateTime(report.created_at)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={downloading === report.id}
                          onClick={() => download(report, "pdf")}
                          icon={<Download size={12} />}
                        >
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => download(report, "csv")}
                          icon={<FileSpreadsheet size={12} />}
                        >
                          CSV
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="font-semibold text-navy-900">Processing report</p>
          <p className="mt-1 leading-relaxed">
            Session metadata, frame reduction, detection breakdown, priority distribution and LayerCAM
            images for high-priority cases.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="font-semibold text-navy-900">Defect report</p>
          <p className="mt-1 leading-relaxed">
            Single-case report with bounding box, priority contributions, explanation images and
            maintenance status.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="font-semibold text-navy-900">Periodic reports</p>
          <p className="mt-1 leading-relaxed">
            Daily, weekly and monthly summaries across all stored detections in the selected window.
          </p>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate report"
        subtitle="Reports use only stored processing data"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={generate} loading={generating} icon={<FileText size={13} />}>
              Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Report type">
            <select
              className="uv-input"
              value={form.report_type}
              onChange={(event) => setForm({ ...form, report_type: event.target.value as ReportType })}
            >
              <option value="job">Video processing report</option>
              <option value="defect">Individual defect report</option>
              <option value="daily">Daily report</option>
              <option value="weekly">Weekly report</option>
              <option value="monthly">Monthly report</option>
            </select>
          </Field>

          {form.report_type === "job" && (
            <Field label="Completed processing job" hint={jobs.length ? undefined : "No completed jobs yet"}>
              <select
                className="uv-input"
                value={form.job_id}
                onChange={(event) => setForm({ ...form, job_id: event.target.value })}
              >
                <option value="">Select a job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    #{job.id} · {job.video?.original_filename}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {form.report_type === "defect" && (
            <Field label="Detection ID" hint="Numeric detection identifier shown on the defect page">
              <input
                className="uv-input"
                type="number"
                min="1"
                placeholder="e.g. 12"
                value={form.detection_id}
                onChange={(event) => setForm({ ...form, detection_id: event.target.value })}
              />
            </Field>
          )}

          {["daily", "weekly", "monthly"].includes(form.report_type) && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" hint="Defaults to the report window">
                <input
                  className="uv-input"
                  type="date"
                  value={form.start_date}
                  onChange={(event) => setForm({ ...form, start_date: event.target.value })}
                />
              </Field>
              <Field label="End date">
                <input
                  className="uv-input"
                  type="date"
                  value={form.end_date}
                  onChange={(event) => setForm({ ...form, end_date: event.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
