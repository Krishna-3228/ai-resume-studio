import React, { useSyncExternalStore } from "react";
import type { ToastPosition } from "./types";
import { toastStore } from "./toastStore";
import { ToastItem } from "./ToastItem";

interface ToasterProps {
  position?: ToastPosition;
  limit?: number;
}

const positionClasses: Record<ToastPosition, string> = {
  "top-right": "top-4 right-4 items-end",
  "top-left": "top-4 left-4 items-start",
  "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
  "bottom-right": "bottom-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
};

export const Toaster: React.FC<ToasterProps> = ({
  position = "top-right",
  limit = 5,
}) => {
  const toasts = useSyncExternalStore(
    (callback) => toastStore.subscribe(callback),
    () => toastStore.getSnapshot(),
    () => []
  );

  const visibleToasts = toasts.slice(0, limit);

  if (visibleToasts.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      className={`fixed z-[99999] pointer-events-none flex flex-col gap-2.5 w-full max-w-sm sm:max-w-md ${positionClasses[position]}`}
    >
      {visibleToasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </aside>
  );
};
