import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { toast, toastStore } from "./toastStore";
import { Toaster } from "./Toaster";
import type { ToastPosition } from "./types";

interface ToastContextValue {
  toast: typeof toast;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export interface ToastProviderProps {
  children: ReactNode;
  position?: ToastPosition;
  limit?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = "top-right",
  limit = 5,
}) => {
  const value: ToastContextValue = {
    toast,
    dismiss: (id: string) => toastStore.dismiss(id),
    clear: () => toastStore.clear(),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster position={position} limit={limit} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // If used outside provider, still allow access to global toast object
    return {
      toast,
      dismiss: (id: string) => toastStore.dismiss(id),
      clear: () => toastStore.clear(),
    };
  }
  return context;
}
