import { motion } from "framer-motion";
import { Activity, Camera, MapPin, ScanSearch, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const HIGHLIGHTS = [
  { icon: <Camera size={16} />, text: "Municipal vehicle camera footage ingest" },
  { icon: <ScanSearch size={16} />, text: "YOLO11n crack, garbage and pothole detection" },
  { icon: <Activity size={16} />, text: "LayerCAM visual explanations per detection" },
  { icon: <MapPin size={16} />, text: "Verified GPS-linked maintenance prioritisation" },
];

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-navy-900 p-10 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(1000px 500px at 90% -10%, rgba(56,189,248,0.35), transparent 60%), radial-gradient(700px 400px at 0% 100%, rgba(16,185,129,0.22), transparent 55%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-emerald-400 text-navy-950">
              <ShieldCheck size={24} strokeWidth={2.3} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-[0.18em]">URBAN VISION AI</p>
              <p className="text-[10px] font-medium tracking-[0.28em] text-accent-300">
                MUNICIPAL INTELLIGENCE
              </p>
            </div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-16 max-w-md text-3xl font-semibold leading-tight tracking-tight"
          >
            AI-driven urban infrastructure monitoring and maintenance prioritisation.
          </motion.h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Convert routine municipal vehicle footage into a prioritised, explainable maintenance
            programme — from keyframe extraction to verified field action.
          </p>

          <div className="mt-10 space-y-3">
            {HIGHLIGHTS.map((item, index) => (
              <motion.div
                key={item.text}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.08 }}
                className="flex items-center gap-3 text-sm text-slate-300"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-accent-300">
                  {item.icon}
                </span>
                {item.text}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-300">
            Supported by SDG 11 &amp; SDG 9
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Sustainable cities and infrastructure innovation through continuous, camera-based
            inspection.
          </p>
        </div>
      </div>

      <div className="flex w-full items-center justify-center px-5 py-10 sm:px-10 lg:w-[54%]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <div className="mb-7 lg:hidden">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white">
              <ShieldCheck size={22} />
            </div>
            <p className="text-sm font-bold tracking-[0.18em] text-navy-900">URBAN VISION AI</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h2>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-slate-500">{footer}</div>}
          <p className="mt-8 text-[11px] text-slate-400">
            AI-Driven Multi-Task Urban Infrastructure Monitoring and Maintenance Prioritization
          </p>
        </motion.div>
      </div>
    </div>
  );
}
