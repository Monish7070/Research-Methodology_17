import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Film,
  Flame,
  Gauge,
  ScanSearch,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartCard from "../components/ChartCard";
import {
  Badge,
  Card,
  CardHeader,
  ClassBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  PriorityBadge,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { Analytics, DashboardSummary, RecentActivity } from "../types";
import { CLASS_COLORS, PRIORITY_COLORS, formatNumber, timeAgo } from "../utils/format";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 10px 30px -18px rgba(16,38,66,0.35)",
};

export default function DashboardPage() {
  const summary = useApi<DashboardSummary>("/dashboard/summary");
  const analytics = useApi<Analytics>("/dashboard/analytics?days=30");
  const recent = useApi<RecentActivity>("/dashboard/recent");

  const cards = summary.data?.cards;
  const charts = analytics.data;
  const hasDefects = (cards?.total_defects ?? 0) > 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Municipal overview"
        title="Infrastructure monitoring dashboard"
        subtitle="Live status of municipal vehicle processing, detected infrastructure defects and maintenance workload."
        actions={
          <>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-700"
            >
              <UploadCloud size={16} /> Upload footage
            </Link>
            <Link
              to="/reports"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ClipboardList size={16} /> Reports
            </Link>
          </>
        }
      />

      {summary.error && (
        <Card className="mb-5">
          <ErrorState message={summary.error} onRetry={summary.reload} />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Videos processed"
          value={formatNumber(cards?.videos_processed)}
          hint={`${formatNumber(cards?.total_videos)} uploaded · ${formatNumber(cards?.processing_jobs)} jobs`}
          icon={<Video size={17} />}
          loading={summary.loading}
          tone="navy"
        />
        <StatCard
          label="Keyframes extracted"
          value={formatNumber(cards?.total_keyframes)}
          hint="SSIM-selected informative frames"
          icon={<Film size={17} />}
          tone="accent"
          loading={summary.loading}
        />
        <StatCard
          label="Defects detected"
          value={formatNumber(cards?.total_defects)}
          hint={`${formatNumber(cards?.explained_detections)} with LayerCAM explanations`}
          icon={<ScanSearch size={17} />}
          tone="purple"
          loading={summary.loading}
        />
        <StatCard
          label="High-priority cases"
          value={formatNumber(cards?.high_priority)}
          hint="Priority score ≥ 70"
          icon={<AlertTriangle size={17} />}
          tone="danger"
          loading={summary.loading}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Cracks"
          value={formatNumber(cards?.cracks)}
          icon={<Activity size={16} />}
          tone="danger"
          loading={summary.loading}
        />
        <StatCard
          label="Garbage"
          value={formatNumber(cards?.garbage)}
          icon={<Trash2 size={16} />}
          tone="success"
          loading={summary.loading}
        />
        <StatCard
          label="Potholes"
          value={formatNumber(cards?.potholes)}
          icon={<Flame size={16} />}
          tone="warning"
          loading={summary.loading}
        />
        <StatCard
          label="Pending maintenance"
          value={formatNumber(cards?.pending_maintenance)}
          hint={`${formatNumber(cards?.open_tasks)} open work tasks`}
          icon={<Gauge size={16} />}
          tone="accent"
          loading={summary.loading}
        />
        <StatCard
          label="Completed"
          value={formatNumber(cards?.completed_maintenance)}
          icon={<CheckCircle2 size={16} />}
          tone="success"
          loading={summary.loading}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <ChartCard
          title="Defects by category"
          subtitle="Detected infrastructure problem classes"
          loading={analytics.loading}
          error={analytics.error}
          empty={!hasDefects}
        >
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={charts?.defects_by_category ?? []}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                strokeWidth={0}
              >
                {(charts?.defects_by_category ?? []).map((entry) => (
                  <Cell key={entry.key} fill={CLASS_COLORS[entry.key] ?? "#64748b"} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Defects detected over time"
          subtitle="Rolling 30-day detection activity"
          loading={analytics.loading}
          error={analytics.error}
          empty={!hasDefects}
        >
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={charts?.defects_over_time ?? []}>
              <defs>
                <linearGradient id="crackFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="potholeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="garbageFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(value: string) => value.slice(5)}
                interval="preserveStartEnd"
                minTickGap={24}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="crack" stackId="1" stroke="#ef4444" fill="url(#crackFill)" strokeWidth={1.8} />
              <Area type="monotone" dataKey="pothole" stackId="1" stroke="#f59e0b" fill="url(#potholeFill)" strokeWidth={1.8} />
              <Area type="monotone" dataKey="garbage" stackId="1" stroke="#10b981" fill="url(#garbageFill)" strokeWidth={1.8} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Maintenance priority distribution"
          subtitle="Weighted score categories"
          loading={analytics.loading}
          error={analytics.error}
          empty={!hasDefects}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={charts?.priority_distribution ?? []} barSize={38}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {(charts?.priority_distribution ?? []).map((entry) => (
                  <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] ?? "#64748b"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Road condition trend"
          subtitle="Average priority score per detection day"
          loading={analytics.loading}
          error={analytics.error}
          empty={!charts?.road_condition_trend?.length}
        >
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={charts?.road_condition_trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(value: string) => value.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="average_priority" stroke="#0284c7" strokeWidth={2.2} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Detection confidence distribution"
          subtitle="Confidence bands across recent detections"
          loading={analytics.loading}
          error={analytics.error}
          empty={!hasDefects}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={charts?.confidence_distribution ?? []} barSize={34}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} angle={-12} height={42} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Monthly infrastructure statistics"
          subtitle="Detections and priority mix by month"
          loading={analytics.loading}
          error={analytics.error}
          empty={!charts?.monthly_stats?.length}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={charts?.monthly_stats ?? []} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="high" stackId="p" fill="#dc2626" radius={[0, 0, 0, 0]} name="High" />
              <Bar dataKey="medium" stackId="p" fill="#d97706" name="Medium" />
              <Bar dataKey="low" stackId="p" fill="#059669" radius={[6, 6, 0, 0]} name="Low" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Latest high-priority cases"
            subtitle="Highest weighted maintenance scores from stored detections"
            action={
              <Link to="/priority" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:text-accent-700">
                Open priority analysis <ArrowUpRight size={13} />
              </Link>
            }
          />
          {recent.loading ? (
            <LoadingBlock height="h-40" />
          ) : recent.data?.high_priority?.length ? (
            <div className="overflow-x-auto">
              <table className="uv-table">
                <thead>
                  <tr>
                    <th>Defect</th>
                    <th>Class</th>
                    <th>Confidence</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.high_priority.map((detection) => (
                    <tr key={detection.id}>
                      <td>
                        <Link to={`/defects?focus=${detection.id}`} className="font-semibold text-navy-900 hover:text-accent-600">
                          {detection.defect_code}
                        </Link>
                        <p className="max-w-[220px] truncate text-[11px] text-slate-400">{detection.frame_name}</p>
                      </td>
                      <td>
                        <ClassBadge name={detection.class_name} />
                      </td>
                      <td className="tabular-nums">{(detection.confidence * 100).toFixed(1)}%</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <PriorityBadge category={detection.priority?.category} />
                          <span className="text-xs font-semibold tabular-nums text-slate-600">
                            {detection.priority?.total_score.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={detection.maintenance_status} label={detection.maintenance_status_label} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No high-priority cases"
              description="High-priority cases appear here once processing finds defects scoring 70 or above."
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent maintenance updates"
            subtitle="Status history across all defects"
          />
          {recent.loading ? (
            <LoadingBlock height="h-40" />
          ) : recent.data?.recent_updates?.length ? (
            <ol className="space-y-4 px-5 py-4">
              {recent.data.recent_updates.slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="relative mt-1 flex flex-col items-center">
                    <span className="h-2 w-2 rounded-full bg-accent-500" />
                    <span className="mt-1 h-full w-px bg-slate-200" />
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-semibold text-navy-900">
                      {entry.to_status_label}{" "}
                      <span className="font-normal text-slate-400">· DEF-{String(entry.detection_id).padStart(5, "0")}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      {entry.comment || "Status updated"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {entry.changed_by} · {timeAgo(entry.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No updates yet" description="Maintenance status changes will be listed here." />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Recently uploaded footage"
            subtitle="Latest municipal camera captures"
            action={
              <Link to="/history" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
                View all
              </Link>
            }
          />
          {recent.loading ? (
            <LoadingBlock height="h-40" />
          ) : recent.data?.recent_videos?.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.data.recent_videos.map((video) => (
                <li key={video.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    {video.media_type === "image" ? <ScanSearch size={16} /> : <Video size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-navy-900">{video.original_filename}</p>
                    <p className="text-[11px] text-slate-400">
                      {timeAgo(video.uploaded_at)} · {video.uploaded_by ?? "system"}
                    </p>
                  </div>
                  <StatusBadge status={video.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No footage uploaded"
              description="Upload a road-monitoring video or image to begin the AI pipeline."
              action={
                <Link to="/upload" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
                  Upload footage
                </Link>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Recently detected defects" subtitle="Newest detections across all jobs" />
          {recent.loading ? (
            <LoadingBlock height="h-40" />
          ) : recent.data?.recent_detections?.length ? (
            <div className="divide-y divide-slate-100">
              {recent.data.recent_detections.map((detection) => (
                <div key={detection.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                    <ScanSearch size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-xs font-semibold text-navy-900">
                      {detection.defect_code}
                      <ClassBadge name={detection.class_name} />
                    </p>
                    <p className="truncate text-[11px] text-slate-400">{detection.frame_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums text-slate-700">
                      {(detection.confidence * 100).toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-slate-400">{timeAgo(detection.detected_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No detections yet" description="Run the AI pipeline on uploaded footage to populate this list." />
          )}
        </Card>
      </div>

      {charts && charts.defects_over_time?.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span>Window: last {charts.window_days} days</span>
          <span>·</span>
          <span>Average priority score: {charts.average_priority.toFixed(1)} / 100</span>
          <span>·</span>
          <div className="flex items-center gap-2">
            <span>Maintenance load</span>
            <div className="w-32">
              <ProgressBar
                value={
                  (cards?.completed_maintenance ?? 0) + (cards?.pending_maintenance ?? 0) === 0
                    ? 0
                    : ((cards?.completed_maintenance ?? 0) /
                        ((cards?.completed_maintenance ?? 0) + (cards?.pending_maintenance ?? 1))) *
                      100
                }
                tone="success"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
