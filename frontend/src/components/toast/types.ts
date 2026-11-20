import type { ReactNode } from "react";

export type ToastType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "created"
  | "updated"
  | "deleted"
  | "saved"
  | "reverted"
  | "compiled";

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
}

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  duration?: number; // ms, default 4000; set to 0 or Infinity to keep open until dismissed
  action?: ToastAction;
  icon?: ReactNode;
}

export interface ToastItemData {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
  createdAt: number;
  action?: ToastAction;
  icon?: ReactNode;
}

export type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "top-center"
  | "bottom-center";
