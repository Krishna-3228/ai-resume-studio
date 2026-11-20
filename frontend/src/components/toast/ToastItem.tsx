import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  Trash2,
  RotateCcw,
  Save,
  Play,
  PlusCircle,
  Edit3,
  X,
} from "lucide-react";
import type { ToastItemData, ToastType } from "./types";
import { toastStore } from "./toastStore";

interface ToastItemProps {
  toast: ToastItemData;
}

interface ToastTypeConfig {
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  borderLeft: string;
  progressBar: string;
}

const typeConfigs: Record<ToastType, ToastTypeConfig> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    iconBg: "bg-emerald-50",
    iconBorder: "border-emerald-200",
    borderLeft: "border-l-emerald-500",
    progressBar: "bg-emerald-500",
  },
  created: {
    icon: <PlusCircle className="h-4 w-4 text-orange-600" />,
    iconBg: "bg-orange-50",
    iconBorder: "border-orange-200",
    borderLeft: "border-l-orange-500",
    progressBar: "bg-orange-500",
  },
  updated: {
    icon: <Edit3 className="h-4 w-4 text-blue-600" />,
    iconBg: "bg-blue-50",
    iconBorder: "border-blue-200",
    borderLeft: "border-l-blue-500",
    progressBar: "bg-blue-500",
  },
  saved: {
    icon: <Save className="h-4 w-4 text-teal-600" />,
    iconBg: "bg-teal-50",
    iconBorder: "border-teal-200",
    borderLeft: "border-l-teal-500",
    progressBar: "bg-teal-500",
  },
  reverted: {
    icon: <RotateCcw className="h-4 w-4 text-amber-600" />,
    iconBg: "bg-amber-50",
    iconBorder: "border-amber-200",
    borderLeft: "border-l-amber-500",
    progressBar: "bg-amber-500",
  },
  compiled: {
    icon: <Play className="h-4 w-4 text-emerald-600 fill-current" />,
    iconBg: "bg-emerald-50",
    iconBorder: "border-emerald-200",
    borderLeft: "border-l-emerald-500",
    progressBar: "bg-emerald-500",
  },
  deleted: {
    icon: <Trash2 className="h-4 w-4 text-rose-600" />,
    iconBg: "bg-rose-50",
    iconBorder: "border-rose-200",
    borderLeft: "border-l-rose-500",
    progressBar: "bg-rose-500",
  },
  error: {
    icon: <AlertCircle className="h-4 w-4 text-rose-600" />,
    iconBg: "bg-rose-50",
    iconBorder: "border-rose-200",
    borderLeft: "border-l-rose-500",
    progressBar: "bg-rose-500",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    iconBg: "bg-amber-50",
    iconBorder: "border-amber-200",
    borderLeft: "border-l-amber-500",
    progressBar: "bg-amber-500",
  },
  info: {
    icon: <Info className="h-4 w-4 text-sky-600" />,
    iconBg: "bg-sky-50",
    iconBorder: "border-sky-200",
    borderLeft: "border-l-sky-500",
    progressBar: "bg-sky-500",
  },
  loading: {
    icon: <Loader2 className="h-4 w-4 animate-spin text-orange-600" />,
    iconBg: "bg-orange-50",
    iconBorder: "border-orange-200",
    borderLeft: "border-l-orange-500",
    progressBar: "bg-orange-500",
  },
};

export const ToastItem: React.FC<ToastItemProps> = ({ toast }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  const duration = toast.duration;
  const config = typeConfigs[toast.type] || typeConfigs.info;
  const remainingTimeRef = useRef<number>(duration);
  const animationFrameRef = useRef<number | null>(null);

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      toastStore.dismiss(toast.id);
    }, 200); // 200ms exit transition
  };

  useEffect(() => {
    if (duration <= 0) return;

    let lastTimestamp = performance.now();

    const tick = (now: number) => {
      if (!isPaused) {
        const delta = now - lastTimestamp;
        remainingTimeRef.current -= delta;

        const percent = Math.max(0, (remainingTimeRef.current / duration) * 100);
        setProgress(percent);

        if (remainingTimeRef.current <= 0) {
          handleDismiss();
          return;
        }
      }
      lastTimestamp = now;
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [duration, isPaused]);

  return (
    <div
      role="alert"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        boxShadow:
          "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3), 0 0 1px 1px rgba(0, 0, 0, 0.05)",
      }}
      className={`group pointer-events-auto relative flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200/90 border-l-4 ${
        config.borderLeft
      } bg-white p-4 text-slate-800 transition-all duration-200 select-none ${
        isClosing
          ? "opacity-0 translate-x-6 scale-95 duration-150"
          : "animate-toast-in"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${config.iconBorder} ${config.iconBg} shadow-xs mt-0.5`}
        >
          {toast.icon || config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-3">
          <h4 className="text-xs font-extrabold text-slate-900 tracking-tight leading-snug">
            {toast.title}
          </h4>
          {toast.description && (
            <p className="mt-1 text-xs text-slate-600 leading-relaxed font-medium break-words">
              {toast.description}
            </p>
          )}

          {/* Action button if provided */}
          {toast.action && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  handleDismiss();
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-wide transition-all ${
                  toast.action.variant === "danger"
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                    : toast.action.variant === "primary"
                    ? "bg-slate-900 hover:bg-black text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                }`}
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close notification"
          className="shrink-0 -mr-1 -mt-1 rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress Bar (countdown timer) */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
          <div
            className={`h-full transition-all ease-linear ${config.progressBar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
