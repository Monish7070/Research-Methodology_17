import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Inbox, Loader2, X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect } from "react";

/* ------------------------------------------------------------------ layout */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("uv-card", className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div>
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ buttons */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-600 text-white shadow-sm hover:bg-accent-700 focus-visible:ring-accent-500/40 disabled:bg-accent-400",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 disabled:bg-red-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {loading ? <Loader2 size={size === "sm" ? 13 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ badges */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "purple";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  accent: "bg-accent-50 text-accent-700 border-accent-200",
  purple: "bg-violet-50 text-violet-700 border-violet-200",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PriorityBadge({ category }: { category?: string | null }) {
  if (!category) return <Badge>Unscored</Badge>;
  const tone: Tone = category === "high" ? "danger" : category === "medium" ? "warning" : "success";
  return <Badge tone={tone}>{category.charAt(0).toUpperCase() + category.slice(1)}</Badge>;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const map: Record<string, Tone> = {
    newly_detected: "info",
    pending_review: "warning",
    approved: "success",
    assigned: "purple",
    in_progress: "accent",
    resolved: "success",
    rejected: "neutral",
    completed: "success",
    running: "accent",
    queued: "info",
    failed: "danger",
    uploaded: "neutral",
    processing: "accent",
    processed: "success",
  };
  return <Badge tone={map[status] ?? "neutral"}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

export function ClassBadge({ name }: { name: string }) {
  const map: Record<string, Tone> = { crack: "danger", garbage: "success", pothole: "warning" };
  return <Badge tone={map[name] ?? "neutral"}>{name.charAt(0).toUpperCase() + name.slice(1)}</Badge>;
}

/* ------------------------------------------------------------------ states */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-accent-600", className)} size={20} />;
}

export function LoadingBlock({ label = "Loading data…", height = "h-48" }: { label?: string; height?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 text-slate-400", height)}>
      <Spinner />
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon ?? <Inbox size={22} />}
      </div>
      <p className="text-sm font-semibold text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <AlertCircle size={22} />
      </div>
      <p className="text-sm font-semibold text-navy-900">Something went wrong</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="uv-label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={clsx("w-full rounded-2xl bg-white shadow-2xl", width)}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-navy-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ metrics */

export function ProgressBar({
  value,
  tone = "accent",
  height = "h-2",
}: {
  value: number;
  tone?: "accent" | "success" | "warning" | "danger" | "navy";
  height?: string;
}) {
  const colors = {
    accent: "bg-accent-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    navy: "bg-navy-800",
  };
  return (
    <div className={clsx("w-full overflow-hidden rounded-full bg-slate-100", height)}>
      <motion.div
        className={clsx("h-full rounded-full", colors[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "accent",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger" | "navy" | "purple";
  loading?: boolean;
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent-50 text-accent-600",
    success: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-red-50 text-red-600",
    navy: "bg-navy-50 text-navy-700",
    purple: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="uv-card p-4 transition hover:shadow-lg hover:shadow-slate-200/60 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-navy-900">{value}</p>
          )}
          {hint && <p className="mt-1 truncate text-[11px] text-slate-400">{hint}</p>}
        </div>
        {icon && (
          <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            value === tab.id ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[10px] text-slate-400">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ImageLightbox({
  src,
  caption,
  onClose,
}: {
  src: string | null;
  caption?: string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {src && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-navy-950/85 p-4 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <img
            src={src}
            alt={caption ?? "Keyframe preview"}
            className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
          {caption && <p className="mt-3 text-xs text-slate-300">{caption}</p>}
          <button
            type="button"
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
