"use client";

/**
 * Legacy admin toast API — now an adapter over the app-wide sonner toaster.
 *
 * This used to be a second, independent toast system (module-level array +
 * CustomEvent + its own <AdminToaster /> fixed container mounted in the admin
 * layout), so the admin dashboard rendered TWO toasters at once, in different
 * corners with different styling. The rendering is gone; these exports remain
 * so existing call sites keep working and now produce the same toasts as the
 * rest of the app. See mdfiles/toast-system.md.
 */

import { toast } from "@/../../components/ui/use-toast";

type ToastType = "success" | "error" | "warning" | "info";

const VARIANTS = {
  success: "success",
  error: "destructive",
  warning: "warning",
  info: "info",
} as const;

/** Show a toast from a bare message + type. */
export const addToast = (message: string, type: ToastType = "info") => {
  toast({ title: message, variant: VARIANTS[type] });
  return 0; // legacy call sites ignore the return value
};

/** No-op: sonner owns dismissal (each toast has its own close button). */
export const removeToast = (_id: number) => {};

/** Same shape as useToast()'s toast() — forwarded as-is. */
export function showAdminToast(toastProps: {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}) {
  toast(toastProps);
}

/**
 * Renders nothing. The single <Toaster /> in the root layout draws all toasts;
 * kept as an export so any stale import does not break the build.
 */
export function AdminToaster() {
  return null;
}
