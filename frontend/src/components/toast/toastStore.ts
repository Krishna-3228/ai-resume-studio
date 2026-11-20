import type { ToastItemData, ToastOptions, ToastType } from "./types";

type Listener = (toasts: ToastItemData[]) => void;

class ToastStore {
  private toasts: ToastItemData[] = [];
  private listeners: Set<Listener> = new Set();
  private maxToasts = 5;

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): ToastItemData[] {
    return this.toasts;
  }

  private notify() {
    const copy = [...this.toasts];
    this.listeners.forEach((listener) => listener(copy));
  }

  public add(type: ToastType, title: string, optionsOrDesc?: string | ToastOptions): string {
    const options: ToastOptions =
      typeof optionsOrDesc === "string"
        ? { description: optionsOrDesc }
        : optionsOrDesc || {};

    const id = options.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const duration = options.duration !== undefined ? options.duration : type === "loading" ? 0 : 4500;

    const existingIndex = this.toasts.findIndex((t) => t.id === id);
    const newToast: ToastItemData = {
      id,
      type,
      title: options.title || title,
      description: options.description !== undefined ? options.description : (options.title ? title : undefined),
      duration,
      createdAt: Date.now(),
      action: options.action,
      icon: options.icon,
    };

    if (existingIndex !== -1) {
      // Update existing toast (useful for loading -> success/error)
      this.toasts[existingIndex] = newToast;
    } else {
      // Prepend or append up to maxToasts
      this.toasts = [newToast, ...this.toasts].slice(0, this.maxToasts);
    }

    this.notify();
    return id;
  }

  public dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  public clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toastStore = new ToastStore();

// Helper to normalize arguments
function createToastFn(type: ToastType) {
  return (title: string, optionsOrDesc?: string | ToastOptions): string => {
    return toastStore.add(type, title, optionsOrDesc);
  };
}

export const toast = Object.assign(
  (title: string, optionsOrDesc?: string | ToastOptions) =>
    toastStore.add("info", title, optionsOrDesc),
  {
    success: createToastFn("success"),
    error: createToastFn("error"),
    warning: createToastFn("warning"),
    info: createToastFn("info"),
    loading: createToastFn("loading"),

    // Semantic action notifications
    created: (entity: string, nameOrOptions?: string | ToastOptions) => {
      const desc =
        typeof nameOrOptions === "string"
          ? `${nameOrOptions} has been created.`
          : nameOrOptions?.description;
      const opts = typeof nameOrOptions === "object" ? nameOrOptions : { description: desc };
      return toastStore.add("created", `${entity} Created`, opts);
    },

    updated: (entity: string, nameOrOptions?: string | ToastOptions) => {
      const desc =
        typeof nameOrOptions === "string"
          ? `${nameOrOptions} has been updated.`
          : nameOrOptions?.description;
      const opts = typeof nameOrOptions === "object" ? nameOrOptions : { description: desc };
      return toastStore.add("updated", `${entity} Updated`, opts);
    },

    deleted: (entity: string, nameOrOptions?: string | ToastOptions) => {
      const desc =
        typeof nameOrOptions === "string"
          ? `${nameOrOptions} has been deleted.`
          : nameOrOptions?.description;
      const opts = typeof nameOrOptions === "object" ? nameOrOptions : { description: desc };
      return toastStore.add("deleted", `${entity} Deleted`, opts);
    },

    saved: (entity: string, detailsOrOptions?: string | ToastOptions) => {
      const desc =
        typeof detailsOrOptions === "string"
          ? detailsOrOptions
          : detailsOrOptions?.description || "All changes saved to disk.";
      const opts = typeof detailsOrOptions === "object" ? detailsOrOptions : { description: desc };
      return toastStore.add("saved", `${entity} Saved`, opts);
    },

    reverted: (entity: string, detailsOrOptions?: string | ToastOptions) => {
      const desc =
        typeof detailsOrOptions === "string"
          ? detailsOrOptions
          : detailsOrOptions?.description || "Reverted to previous saved state.";
      const opts = typeof detailsOrOptions === "object" ? detailsOrOptions : { description: desc };
      return toastStore.add("reverted", `${entity} Reverted`, opts);
    },

    compiled: (entity: string, detailsOrOptions?: string | ToastOptions) => {
      const desc =
        typeof detailsOrOptions === "string"
          ? detailsOrOptions
          : detailsOrOptions?.description || "Compiled successfully with 0 errors.";
      const opts = typeof detailsOrOptions === "object" ? detailsOrOptions : { description: desc };
      return toastStore.add("compiled", `${entity} Compiled`, opts);
    },

    dismiss: (id: string) => toastStore.dismiss(id),
    clear: () => toastStore.clear(),

    promise: async <T>(
      promise: Promise<T>,
      msgs: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      }
    ): Promise<T> => {
      const id = toastStore.add("loading", msgs.loading);
      try {
        const data = await promise;
        const msg = typeof msgs.success === "function" ? msgs.success(data) : msgs.success;
        toastStore.add("success", msg, { id });
        return data;
      } catch (err) {
        const msg = typeof msgs.error === "function" ? msgs.error(err) : msgs.error;
        toastStore.add("error", msg, { id });
        throw err;
      }
    },
  }
);
