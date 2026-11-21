import clsx from "clsx";
import { ClipboardCheck, ClipboardList, MapPin, MessageSquare, Send, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, queryString } from "../services/api";
import type { Detection, HistoryEntry, MaintenanceTask, MaintenanceStatus, User } from "../types";
import { formatDateTime, titleCase } from "../utils/format";

interface DefectListResponse {
  total: number;
  counts: Record<string, number>;
  items: Detection[];
}

const STATUS_TABS: { id: "all" | MaintenanceStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "newly_detected", label: "New" },
  { id: "pending_review", label: "Review" },
  { id: "approved", label: "Approved" },
  { id: "assigned", label: "Assigned" },
  { id: "in_progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
  { id: "rejected", label: "Rejected" },
];

export default function DefectsPage() {
  const [params] = useSearchParams();
  const focus = params.get("focus") ? Number(params.get("focus")) : null;
  const [status, setStatus] = useState<"all" | MaintenanceStatus>("all");
  const [priority, setPriority] = useState("all");
  const [className, setClassName] = useState("all");
  const [data, setData] = useState<DefectListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(focus);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<DefectListResponse>(
        `/defects${queryString({ status, priority, class_name: className, limit: 200 })}`,
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load defects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, className]);

  const counts = data?.counts ?? {};
  const pending =
    (counts.newly_detected ?? 0) + (counts.pending_review ?? 0) + (counts.approved ?? 0) + (counts.assigned ?? 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Case management"
        title="Infrastructure defect management"
        subtitle="Review every detected defect, approve or reject cases, assign field work and record resolution details with a full status history."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total defects" value={data?.total ?? "—"} icon={<ClipboardList size={16} />} tone="navy" />
        <StatCard label="Awaiting action" value={pending} hint="New, review, approved or assigned" tone="warning" icon={<ShieldAlert size={16} />} />
        <StatCard label="In progress" value={counts.in_progress ?? 0} tone="accent" icon={<ClipboardCheck size={16} />} />
        <StatCard label="Resolved" value={counts.resolved ?? 0} tone="success" icon={<ClipboardCheck size={16} />} />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader
          title="Defect register"
          subtitle="Click a row to review the case, its explanation and history"
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
              <select
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-accent-500"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          }
        />
        <div className="border-b border-slate-100 px-4 py-3">
          <Tabs
            value={status}
            onChange={setStatus}
            tabs={STATUS_TABS.map((tab) => ({
              id: tab.id,
              label: tab.label,
              count: tab.id === "all" ? data?.total : counts[tab.id],
            }))}
          />
        </div>

        {loading ? (
          <LoadingBlock height="h-64" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data?.items.length ? (
          <EmptyState title="No defects in this view" description="Change the filters or process new footage." />
        ) : (
          <div className="overflow-x-auto">
            <table className="uv-table">
              <thead>
                <tr>
                  <th>Defect</th>
                  <th>Class</th>
                  <th>Confidence</th>
                  <th>Priority</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Detected</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((defect) => (
                  <tr key={defect.id} className="cursor-pointer" onClick={() => setOpenId(defect.id)}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                          {defect.annotated_url || defect.image_url ? (
                            <img
                              src={defect.annotated_url ?? defect.image_url ?? ""}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="font-semibold text-navy-900">{defect.defect_code}</p>
                          <p className="max-w-[170px] truncate text-[10px] text-slate-400">{defect.frame_name}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ClassBadge name={defect.class_name} />
                    </td>
                    <td className="tabular-nums">{(defect.confidence * 100).toFixed(1)}%</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <PriorityBadge category={defect.priority?.category} />
                        <span className="text-[11px] tabular-nums text-slate-500">
                          {defect.priority?.total_score.toFixed(0) ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td>
                      {defect.location ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                          <MapPin size={11} className="text-emerald-500" />
                          {defect.location.latitude.toFixed(4)}, {defect.location.longitude.toFixed(4)}
                          {defect.location.verified && <Badge tone="success">verified</Badge>}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Location unavailable</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={defect.maintenance_status} label={defect.maintenance_status_label} />
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-slate-500">{formatDateTime(defect.detected_at)}</td>
                    <td>
                      <Button variant="ghost" size="sm">
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DefectDrawer detectionId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

export function DefectDrawer({
  detectionId,
  onClose,
  onChanged,
}: {
  detectionId: number | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { can, user } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<(Detection & { tasks: MaintenanceTask[]; history: HistoryEntry[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ latitude: "", longitude: "", label: "", verified: true });
  const [tab, setTab] = useState<"overview" | "location" | "history">("overview");

  async function load() {
    if (!detectionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Detection & { tasks: MaintenanceTask[]; history: HistoryEntry[] }>(
        `/detections/${detectionId}`,
      );
      setData(response);
      setLocationDraft({
        latitude: response.location?.latitude?.toString() ?? "",
        longitude: response.location?.longitude?.toString() ?? "",
        label: response.location?.label ?? "",
        verified: response.location?.verified ?? true,
      });
      setAssignee(response.tasks?.[0]?.assigned_to_id?.toString() ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load defect");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (detectionId) {
      setTab("overview");
      setComment("");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionId]);

  useEffect(() => {
    if (!detectionId) return;
    api
      .get<{ items: User[] }>("/maintenance/assignees")
      .then((response) => setUsers(response.items))
      .catch(() => setUsers([]));
  }, [detectionId]);

  async function updateStatus(status: MaintenanceStatus, note?: string) {
    if (!data) return;
    setBusy(true);
    try {
      const task = data.tasks?.[0];
      if (task) {
        await api.put(`/maintenance/${task.id}`, { status, comment: note ?? "" });
      } else {
        await api.put(`/defects/${data.id}/status`, { status, comment: note ?? "" });
      }
      notify("success", `Status updated to ${titleCase(status)}`);
      await load();
      onChanged?.();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!data) return;
    setBusy(true);
    try {
      const task = data.tasks?.[0];
      if (task) {
        await api.put(`/maintenance/${task.id}`, {
          assigned_to_id: assignee ? Number(assignee) : null,
          status: assignee ? "assigned" : undefined,
          comment: "Assignment updated",
        });
      } else {
        await api.post("/maintenance", {
          detection_id: data.id,
          assigned_to_id: assignee ? Number(assignee) : null,
          status: assignee ? "assigned" : "approved",
          title: `${data.class_name} - ${data.defect_code}`,
          notes: "Maintenance task created from defect review",
        });
      }
      notify("success", "Work assignment updated");
      await load();
      onChanged?.();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation() {
    if (!data) return;
    setBusy(true);
    try {
      await api.put(`/locations/${data.id}`, {
        latitude: Number(locationDraft.latitude),
        longitude: Number(locationDraft.longitude),
        label: locationDraft.label,
        road_name: locationDraft.label,
        verified: locationDraft.verified,
      });
      notify("success", "Verified location saved and priority recalculated");
      await load();
      onChanged?.();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save location");
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!data || !comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/maintenance/comment/${data.id}`, { comment: comment.trim() });
      setComment("");
      notify("success", "Comment added");
      await load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not add comment");
    } finally {
      setBusy(false);
    }
  }

  const canReview = can("defect:review");
  const canAssign = can("defect:assign");
  const isInspector = user?.role === "inspector";
  const priority = data?.priority;
  const nextStatuses: { status: MaintenanceStatus; label: string; variant: "primary" | "secondary" | "danger" | "success" }[] =
    [
      { status: "pending_review", label: "Send to review", variant: "secondary" },
      { status: "approved", label: "Approve", variant: "success" },
      { status: "rejected", label: "Reject", variant: "danger" },
      { status: "in_progress", label: "Start work", variant: "primary" },
      { status: "resolved", label: "Mark resolved", variant: "success" },
    ];

  return (
    <Modal
      open={Boolean(detectionId)}
      onClose={onClose}
      title={data ? `${data.defect_code} · ${titleCase(data.class_name)}` : "Defect"}
      subtitle={data ? `${data.frame_name} · job #${data.job_id}` : undefined}
      width="max-w-5xl"
      footer={
        data && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {isInspector
                ? "Field inspectors can update work status, locations and comments."
                : "Officer / administrator actions"}
            </span>
            <div className="flex flex-wrap gap-2">
              {canAssign && (
                <div className="flex items-center gap-1.5">
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.role_label}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={assign} loading={busy}>
                    Assign
                  </Button>
                </div>
              )}
              {nextStatuses
                .filter((item) =>
                  canReview || item.status === "in_progress" || item.status === "resolved",
                )
                .map((item) => (
                  <Button
                    key={item.status}
                    size="sm"
                    variant={item.variant}
                    onClick={() => updateStatus(item.status)}
                    loading={busy}
                    disabled={
                      data.maintenance_status === item.status ||
                      (item.status === "rejected" && data.maintenance_status === "resolved")
                    }
                  >
                    {item.label}
                  </Button>
                ))}
            </div>
          </div>
        )
      }
    >
      {loading ? (
        <LoadingBlock height="h-72" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.maintenance_status} label={data.maintenance_status_label} />
            <ClassBadge name={data.class_name} />
            <PriorityBadge category={priority?.category} />
            <span className="text-xs text-slate-500">Confidence {(data.confidence * 100).toFixed(2)}%</span>
            <div className="ml-auto">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "overview", label: "Overview" },
                  { id: "location", label: "Location" },
                  { id: "history", label: "History", count: data.history?.length },
                ]}
              />
            </div>
          </div>

          {tab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="overflow-hidden rounded-xl bg-navy-950">
                  <img
                    src={data.annotated_url ?? data.image_url ?? ""}
                    alt="Annotated defect"
                    className="max-h-[360px] w-full object-contain"
                  />
                </div>
                {data.explanation?.overlay_url && (
                  <img
                    src={data.explanation.overlay_url}
                    alt="LayerCAM overlay"
                    className="mt-3 w-full rounded-xl border border-slate-200"
                  />
                )}
                <div className="mt-3 flex gap-2">
                  <input
                    className="uv-input flex-1 text-xs"
                    placeholder="Add a review comment…"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addComment();
                    }}
                  />
                  <Button size="sm" variant="secondary" onClick={addComment} loading={busy} icon={<Send size={13} />}>
                    Comment
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Detected defect
                  </p>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    <Row label="Defect ID" value={data.defect_code} />
                    <Row label="Frame" value={data.frame_name} />
                    <Row label="Bounding box" value={data.bbox?.map((v) => v.toFixed(0)).join(", ") ?? "—"} />
                    <Row label="Tested confidence" value={`${(data.confidence * 100).toFixed(2)}%`} />
                    <Row label="Detected at" value={formatDateTime(data.detected_at)} />
                    <Row label="LayerCAM" value={data.has_explanation ? "Available" : "Not generated"} />
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Priority score
                    </p>
                    <span className="text-lg font-semibold text-navy-900">
                      {priority?.total_score.toFixed(1) ?? "—"}
                    </span>
                  </div>
                  {priority ? (
                    <div className="mt-3 space-y-2">
                      {[
                        ["Severity", priority.severity_contribution],
                        ["Confidence", priority.confidence_contribution],
                        ["Risk", priority.risk_contribution],
                        ["Location", priority.location_contribution],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <div className="mb-0.5 flex justify-between text-[10px]">
                            <span className="text-slate-500">{label}</span>
                            <span className="font-semibold tabular-nums text-slate-600">
                              {Number(value).toFixed(1)}
                            </span>
                          </div>
                          <ProgressBar value={Number(value) * 2.5} tone="accent" height="h-1.5" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">No priority score stored.</p>
                  )}
                </div>

                {data.tasks?.length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Maintenance task
                    </p>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <Row label="Task" value={`#${data.tasks[0].id}`} />
                      <Row label="Assignee" value={data.tasks[0].assigned_to ?? "Unassigned"} />
                      <Row label="Due" value={data.tasks[0].due_date ? formatDateTime(data.tasks[0].due_date) : "—"} />
                      <Row label="Notes" value={data.tasks[0].notes || "—"} />
                      <Row label="Resolution" value={data.tasks[0].resolution_notes || "—"} />
                    </dl>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "location" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Location record
                </p>
                {data.location ? (
                  <dl className="space-y-1.5 text-xs">
                    <Row label="Latitude" value={data.location.latitude.toFixed(6)} />
                    <Row label="Longitude" value={data.location.longitude.toFixed(6)} />
                    <Row label="Label" value={data.location.label || "—"} />
                    <Row label="Source" value={titleCase(data.location.source)} />
                    <Row label="Verified" value={data.location.verified ? "Yes" : "No"} />
                    <Row label="Recorded by" value={data.location.created_by ?? "—"} />
                  </dl>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Location unavailable. GPS is never inferred from image content — enter a verified
                    location from a field record or vehicle GPS log.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {data.location ? "Update verified location" : "Add verified location"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude">
                    <input
                      className="uv-input"
                      type="number"
                      step="0.000001"
                      value={locationDraft.latitude}
                      onChange={(event) => setLocationDraft({ ...locationDraft, latitude: event.target.value })}
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      className="uv-input"
                      type="number"
                      step="0.000001"
                      value={locationDraft.longitude}
                      onChange={(event) => setLocationDraft({ ...locationDraft, longitude: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Location label" className="mt-3">
                  <input
                    className="uv-input"
                    placeholder="Road name / landmark"
                    value={locationDraft.label}
                    onChange={(event) => setLocationDraft({ ...locationDraft, label: event.target.value })}
                  />
                </Field>
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={locationDraft.verified}
                    onChange={(event) => setLocationDraft({ ...locationDraft, verified: event.target.checked })}
                    className="rounded border-slate-300 text-accent-600"
                  />
                  Mark location as field-verified
                </label>
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  onClick={saveLocation}
                  loading={busy}
                  disabled={!locationDraft.latitude || !locationDraft.longitude}
                  icon={<MapPin size={13} />}
                >
                  Save location
                </Button>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                  Saving recalculates this defect's location contribution to the priority score.
                </p>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="rounded-xl border border-slate-200">
              {!data.history?.length ? (
                <EmptyState
                  icon={<MessageSquare size={20} />}
                  title="No history yet"
                  description="Status changes and comments will be recorded here."
                />
              ) : (
                <ol className="divide-y divide-slate-100">
                  {data.history.map((entry) => (
                    <li key={entry.id} className="flex gap-3 px-4 py-3">
                      <span
                        className={clsx(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          entry.from_status === entry.to_status ? "bg-slate-300" : "bg-accent-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-navy-900">
                          {entry.from_status && entry.from_status !== entry.to_status
                            ? `${titleCase(entry.from_status)} → ${entry.to_status_label}`
                            : entry.to_status_label}
                        </p>
                        {entry.comment && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{entry.comment}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {entry.changed_by} · {formatDateTime(entry.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 pb-1.5 last:border-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-navy-900">{value}</dd>
    </div>
  );
}
