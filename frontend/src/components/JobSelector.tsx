import { ChevronDown, ListFilter } from "lucide-react";
import { useApi } from "../hooks/useApi";
import type { Job } from "../types";
import { StatusBadge } from "./ui";

export default function JobSelector({
  value,
  onChange,
  label = "Processing job",
  includeEmpty = true,
}: {
  value: number | null;
  onChange: (jobId: number | null) => void;
  label?: string;
  includeEmpty?: boolean;
}) {
  const { data, loading } = useApi<{ items: Job[] }>("/processing/jobs?limit=100");
  const jobs = data?.items ?? [];

  return (
    <div className="flex items-center gap-2">
      <ListFilter size={14} className="text-slate-400" />
      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      <div className="relative">
        <select
          className="appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-accent-500"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          disabled={loading}
        >
          {includeEmpty && <option value="">All jobs</option>}
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              #{job.id} · {job.video?.original_filename ?? `Video ${job.video_id}`}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {value && jobs.find((job) => job.id === value) && (
        <StatusBadge status={jobs.find((job) => job.id === value)!.status} />
      )}
    </div>
  );
}
