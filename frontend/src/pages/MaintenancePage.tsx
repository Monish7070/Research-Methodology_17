import clsx from "clsx";
import { CalendarClock, ClipboardCheck, Clock3, UserRound, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  StatCard,
  StatusBadge,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, queryString } from "../services/api";
import type { HistoryEntry, MaintenanceTask, User } from "../types";
import { formatDateTime, titleCase } from "../utils/format";

interface TaskListResponse {
  total: number;
  counts: Record<string, number>;
  items: MaintenanceTask[];
}

const COLUMNS: { status: string; label: string; tone: string }[] = [
  { status: "pending_review", label: "Pending review", tone: "border-amber-300" },
  { status: "approved", label: "Approved", tone: "border-emerald-300" },
  { status: "assigned", label: "Assigned", tone: "border-indigo-300" },
  { status: "in_progress", label: "In progress", tone: "border-sky-300" },
  { status: "resolved", label: "Resolved", tone: "border-emerald-500" },
];

export default function MaintenancePage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [statusFilter, setStatusFilter] = useState("active");
  const [priority, setPriority] = useState("all");
  const [data, setData] = useState<TaskListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [openTask, setOpenTask] = useState<MaintenanceTask | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<TaskListResponse>(
        `/maintenance${queryString({ status: statusFilter === "active" ? undefined : statusFilter, priority, limit: 200 })}`,
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load maintenance tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priority]);

  useEffect(() => {
    api
      .get<{ items: User[] }>("/maintenance/assignees")
      .then((response) => setUsers(response.items))
      .catch(() => setUsers([]));
  }, []);

  async function openDetails(task: MaintenanceTask) {
    setOpenTask(task);
    setComment("");
    setResolution(task.resolution_notes ?? "");
    try {
      const response = await api.get<{ history: HistoryEntry[] }>(`/maintenance/history/${task.id}`);
      setHistory(response.history);
    } catch {
      setHistory([]);
    }
  }

  async function update(task: MaintenanceTask, payload: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.put(`/maintenance/${task.id}`, payload);
      notify("success", message);
      await load();
      const refreshed = await api.get<TaskListResponse>(
        `/maintenance${queryString({ status: statusFilter === "active" ? undefined : statusFilter, priority, limit: 200 })}`,
      );
      const next = refreshed.items.find((item) => item.id === task.id) ?? null;
      setOpenTask(next);
      if (next) {
        const response = await api.get<{ history: HistoryEntry[] }>(`/maintenance/history/${next.id}`);
        setHistory(response.history);
      }
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const tasks = data?.items ?? [];
  const active = tasks.filter((task) =>
    ["pending_review", "approved", "assigned", "in_progress"].includes(task.status),
  );
  const overdue = tasks.filter(
    (task) => task.due_date && new Date(task.due_date) < new Date() && task.status !== "resolved",
  ).length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Operations"
        title="Maintenance tracking"
        subtitle="Work assigned from reviewed defects. Update progress, record resolution notes and keep a complete audit history."
        actions={
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="active">Active work</option>
              <option value="all">All statuses</option>
              <option value="pending_review">Pending review</option>
              <option value="approved">Approved</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total tasks" value={data?.total ?? "—"} icon={<Wrench size={16} />} tone="navy" />
        <StatCard label="Active work" value={active.length} icon={<Clock3 size={16} />} tone="accent" />
        <StatCard label="In progress" value={data?.counts.in_progress ?? 0} icon={<ClipboardCheck size={16} />} tone="warning" />
        <StatCard label="Overdue deadlines" value={overdue} icon={<CalendarClock size={16} />} tone="danger" />
      </div>

      {loading ? (
        <LoadingBlock height="h-72" label="Loading maintenance tasks…" />
      ) : error ? (
        <Card className="mt-5">
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : tasks.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={<Wrench size={22} />}
            title="No maintenance tasks"
            description="Create work assignments while reviewing defects in the defect register."
            action={
              <Link to="/defects" className="text-xs font-semibold text-accent-600">
                Open defect register
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 overflow-x-auto pb-2 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.status);
            return (
              <div key={column.status} className="min-w-[240px]">
                <div className={clsx("mb-2 flex items-center justify-between border-t-2 pt-2", column.tone)}>
                  <p className="text-xs font-semibold text-navy-900">{column.label}</p>
                  <Badge tone="neutral">{columnTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  {columnTasks.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
                      No tasks
                    </p>
                  )}
                  {columnTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openDetails(task)}
                      className="uv-card w-full p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-bold text-navy-900">Task #{task.id}</p>
                        <PriorityBadge category={task.detection?.priority?.category} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600">{task.title}</p>
                      {task.detection && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <ClassBadge name={task.detection.class_name} />
                          <span className="text-[10px] text-slate-400">{task.detection.defect_code}</span>
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                        <UserRound size={10} />
                        {task.assigned_to ?? "Unassigned"}
                      </div>
                      {task.due_date && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                          <CalendarClock size={10} /> {formatDateTime(task.due_date)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(openTask)}
        onClose={() => setOpenTask(null)}
        title={openTask ? `Task #${openTask.id}` : "Maintenance task"}
        subtitle={openTask?.detection ? `${openTask.detection.defect_code} · ${openTask.detection.frame_name}` : undefined}
        width="max-w-3xl"
      >
        {openTask && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Work item
                </p>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Status</dt>
                    <dd>
                      <StatusBadge status={openTask.status} label={openTask.status_label} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Assignee</dt>
                    <dd className="font-medium text-navy-900">{openTask.assigned_to ?? "Unassigned"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Detected class</dt>
                    <dd>{openTask.detection ? <ClassBadge name={openTask.detection.class_name} /> : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Priority</dt>
                    <dd className="font-medium text-navy-900">
                      {openTask.detection?.priority
                        ? `${openTask.detection.priority.total_score.toFixed(1)} (${openTask.detection.priority.category})`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Notes</dt>
                    <dd className="max-w-[220px] text-right text-slate-600">{openTask.notes || "—"}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Update work
                </p>
                <div className="space-y-2">
                  {can("defect:assign") ? (
                    <select
                      className="uv-input text-xs"
                      value={openTask.assigned_to_id ?? ""}
                      onChange={(event) =>
                        update(
                          openTask,
                          { assigned_to_id: event.target.value ? Number(event.target.value) : null },
                          "Assignment updated",
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} · {candidate.role_label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-slate-500">{openTask.assigned_to ?? "Unassigned"}</p>
                  )}
                  <Field label="Resolution notes">
                    <textarea
                      className="uv-input min-h-[64px] text-xs"
                      placeholder="Record what was done on site"
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    loading={busy}
                    onClick={() => update(openTask, { resolution_notes: resolution }, "Resolution notes saved")}
                  >
                    Save resolution notes
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { status: "in_progress", label: "Start work", variant: "primary" as const },
                { status: "resolved", label: "Mark resolved", variant: "success" as const },
                { status: "assigned", label: "Return to assigned", variant: "secondary" as const },
              ].map((action) => (
                <Button
                  key={action.status}
                  size="sm"
                  variant={action.variant}
                  loading={busy}
                  disabled={openTask.status === action.status}
                  onClick={() =>
                    update(
                      openTask,
                      { status: action.status, resolution_notes: resolution || undefined },
                      `Task moved to ${titleCase(action.status)}`,
                    )
                  }
                >
                  {action.label}
                </Button>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Status history
                </p>
                <Badge tone="neutral">{history.length} entries</Badge>
              </div>
              {history.length === 0 ? (
                <p className="px-3.5 py-4 text-[11px] text-slate-400">No history recorded yet.</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {history.map((entry) => (
                    <li key={entry.id} className="px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold text-navy-900">
                        {entry.from_status && entry.from_status !== entry.to_status
                          ? `${titleCase(entry.from_status)} → ${entry.to_status_label}`
                          : entry.to_status_label}
                      </p>
                      {entry.comment && <p className="mt-0.5 text-[11px] text-slate-500">{entry.comment}</p>}
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {entry.changed_by} · {formatDateTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="flex gap-2">
              <input
                className="uv-input flex-1 text-xs"
                placeholder="Add a progress comment…"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                disabled={!comment.trim()}
                onClick={async () => {
                  if (!openTask.detection) return;
                  try {
                    await api.post(`/maintenance/comment/${openTask.detection.id}`, { comment: comment.trim() });
                    setComment("");
                    const response = await api.get<{ history: HistoryEntry[] }>(
                      `/maintenance/history/${openTask.id}`,
                    );
                    setHistory(response.history);
                    notify("success", "Comment added");
                  } catch (err) {
                    notify("error", err instanceof Error ? err.message : "Could not add comment");
                  }
                }}
              >
                Comment
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
