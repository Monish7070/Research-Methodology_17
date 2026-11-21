import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { MapPin, Navigation, ShieldQuestion } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DefectDrawer } from "./DefectsPage";
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
  PriorityBadge,
  StatCard,
} from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { Detection, DetectionLocation } from "../types";
import { CLASS_COLORS, PRIORITY_COLORS, formatDateTime } from "../utils/format";

interface LocationItem extends DetectionLocation {
  detection: Detection;
}

const CLASS_OPTIONS = [
  { id: "all", label: "All classes" },
  { id: "crack", label: "Cracks" },
  { id: "garbage", label: "Garbage" },
  { id: "pothole", label: "Potholes" },
];

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export default function MapPage() {
  const { data, loading, error, reload } = useApi<{ total: number; items: LocationItem[] }>("/locations");
  const [className, setClassName] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const items = data?.items ?? [];
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (className !== "all" && item.detection.class_name !== className) return false;
        if (priorityFilter !== "all" && item.detection.priority?.category !== priorityFilter) return false;
        if (onlyVerified && !item.verified) return false;
        return true;
      }),
    [items, className, priorityFilter, onlyVerified],
  );

  const points = useMemo(() => filtered.map((item) => [item.latitude, item.longitude] as [number, number]), [filtered]);
  const center: [number, number] = points[0] ?? [11.0168, 76.9558];

  const highPriority = items.filter((item) => item.detection.priority?.category === "high").length;
  const verified = items.filter((item) => item.verified).length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Geo intelligence"
        title="Geographic monitoring"
        subtitle="Detected defects plotted from verified GPS metadata or manually entered field locations. Coordinates are never inferred from image content."
        actions={
          <Link to="/defects" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
            Manage defect locations →
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Mapped defects" value={items.length} icon={<MapPin size={16} />} tone="navy" />
        <StatCard label="Verified locations" value={verified} icon={<Navigation size={16} />} tone="success" />
        <StatCard label="High priority on map" value={highPriority} icon={<MapPin size={16} />} tone="danger" />
        <StatCard
          label="Location unavailable"
          value={items.filter((item) => !item.detection.location).length}
          icon={<ShieldQuestion size={16} />}
          tone="warning"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Defect map"
            subtitle={`${filtered.length} marker${filtered.length === 1 ? "" : "s"} displayed`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                >
                  {CLASS_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlyVerified}
                    onChange={(event) => setOnlyVerified(event.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Verified only
                </label>
              </div>
            }
          />

          {loading ? (
            <LoadingBlock height="h-[520px]" label="Loading map data…" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <div className="relative">
              <MapContainer center={center} zoom={12} style={{ height: 540, width: "100%" }} scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds points={points} />
                {filtered.map((item) => (
                  <CircleMarker
                    key={item.id}
                    center={[item.latitude, item.longitude]}
                    radius={9 + (item.detection.priority?.total_score ?? 0) / 14}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 2,
                      fillColor:
                        PRIORITY_COLORS[item.detection.priority?.category ?? "low"] ??
                        CLASS_COLORS[item.detection.class_name] ??
                        "#0ea5e9",
                      fillOpacity: item.verified ? 0.9 : 0.55,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[190px]">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <strong className="text-xs">{item.detection.defect_code}</strong>
                          <span className="text-[10px] uppercase text-slate-500">
                            {item.detection.class_name}
                          </span>
                        </div>
                        <p className="m-0 text-[11px] text-slate-600">
                          Confidence {(item.detection.confidence * 100).toFixed(1)}% ·{" "}
                          {item.detection.priority?.total_score.toFixed(1) ?? "—"} priority
                        </p>
                        <p className="m-0 mt-1 text-[10px] text-slate-500">
                          {item.label || item.road_name || "Recorded location"}
                        </p>
                        <p className="m-0 mt-1 text-[10px] text-slate-400">
                          {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setOpenId(item.detection.id)}
                          className="mt-2 rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white"
                        >
                          Open case
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>

              {filtered.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                  <div className="pointer-events-auto max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-center shadow-lg">
                    <MapPin size={20} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-semibold text-navy-900">No verified locations to plot</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Add a GPS-verified location to a defect from its case view. Location data is never
                      estimated from the image.
                    </p>
                    <Link to="/defects" className="mt-3 inline-block text-xs font-semibold text-accent-600">
                      Open defect register
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="flex max-h-[660px] flex-col overflow-hidden">
          <CardHeader title="Mapped cases" subtitle="Sorted by priority score" />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<MapPin size={20} />}
              title="No mapped defects"
              description="Defects appear here once a verified location is recorded."
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {[...filtered]
                .sort(
                  (a, b) =>
                    (b.detection.priority?.total_score ?? 0) - (a.detection.priority?.total_score ?? 0),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenId(item.detection.id)}
                    className="w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-navy-900">{item.detection.defect_code}</p>
                      <PriorityBadge category={item.detection.priority?.category} />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ClassBadge name={item.detection.class_name} />
                      {item.verified ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {item.label || item.road_name || "Recorded location"}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} ·{" "}
                      {formatDateTime(item.detection.detected_at)}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </Card>
      </div>

      <DefectDrawer detectionId={openId} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  );
}
