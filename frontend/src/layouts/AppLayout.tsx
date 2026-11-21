import clsx from "clsx";
import {
  Camera,
  ClipboardList,
  FileText,
  Film,
  Flame,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ScanSearch,
  Settings,
  ShieldCheck,
  UploadCloud,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Badge } from "../components/ui";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: <LayoutDashboard size={17} /> }],
  },
  {
    title: "AI Processing",
    items: [
      { to: "/upload", label: "Video Upload", icon: <UploadCloud size={17} />, permission: "video:upload" },
      { to: "/capture", label: "Phone Capture", icon: <Camera size={17} />, permission: "video:upload" },
      { to: "/keyframes", label: "Keyframe Extraction", icon: <Film size={17} /> },
      { to: "/detection", label: "Object Detection", icon: <ScanSearch size={17} /> },
      { to: "/explainability", label: "LayerCAM Explainability", icon: <Flame size={17} /> },
    ],
  },
  {
    title: "Analysis",
    items: [
      { to: "/priority", label: "Priority Analysis", icon: <Gauge size={17} /> },
      { to: "/defects", label: "Defect Management", icon: <ClipboardList size={17} /> },
      { to: "/map", label: "Geographic Monitoring", icon: <MapPin size={17} /> },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/maintenance", label: "Maintenance Tracking", icon: <Wrench size={17} /> },
      { to: "/reports", label: "Reports", icon: <FileText size={17} /> },
      { to: "/history", label: "Processing History", icon: <History size={17} /> },
    ],
  },
  {
    title: "Administration",
    items: [
      { to: "/users", label: "User Management", icon: <Users size={17} />, permission: "user:manage" },
      { to: "/settings", label: "Settings", icon: <Settings size={17} />, permission: "settings:manage" },
    ],
  },
];

export default function AppLayout() {
  const { user, logout, can } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const current =
    NAV_GROUPS.flatMap((group) => group.items).find((item) =>
      item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
    ) ?? null;

  const initials = (user?.name ?? "UV")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-emerald-400 text-navy-950 shadow-lg shadow-accent-500/20">
          <ShieldCheck size={22} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-[0.14em] text-white">URBAN VISION</p>
          <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-300">AI PLATFORM</p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      clsx(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={clsx(
                            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-400 transition-opacity",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className={clsx(isActive ? "text-accent-300" : "text-slate-500 group-hover:text-slate-300")}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/20 text-xs font-bold text-accent-200">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user?.name}</p>
            <p className="truncate text-[10px] text-slate-400">{user?.role_label ?? user?.role}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-up">{sidebar}</div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-900">
              {current?.label ?? "Dashboard"}
            </p>
            <p className="hidden truncate text-[11px] text-slate-400 sm:block">
              AI-Powered Urban Infrastructure Monitoring and Maintenance Intelligence
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="success" className="hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              AI pipeline ready
            </Badge>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-navy-800 text-[10px] font-bold text-white">
                {initials}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="text-[11px] font-semibold text-navy-900">{user?.name}</p>
                <p className="text-[10px] text-slate-400">{user?.role_label ?? user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
