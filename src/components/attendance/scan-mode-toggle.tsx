"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";

export type ScanDirection = "in" | "out";

/**
 * The scan mode this device last used («دخول» / «خروج»), kept across reloads
 * so an exit door stays in exit mode. Falls back to «دخول» when storage is
 * unavailable (private mode, blocked site data).
 */
export function useRememberedDirection(storageKey: string): [ScanDirection, (d: ScanDirection) => void] {
  const [direction, setDirection] = useState<ScanDirection>("in");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "in" || saved === "out") setDirection(saved);
    } catch {
      /* storage unavailable — keep «دخول» */
    }
  }, [storageKey]);
  const update = (d: ScanDirection) => {
    setDirection(d);
    try {
      localStorage.setItem(storageKey, d);
    } catch {
      /* not remembered — still works for this session */
    }
  };
  return [direction, update];
}

/** Two large buttons: «دخول» (green) / «خروج» (red). The selected one is filled. */
export default function ScanModeToggle({ value, onChange }: { value: ScanDirection; onChange: (d: ScanDirection) => void }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">نوع المسح (يبقى محفوظاً على هذا الجهاز):</div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع المسح">
        <button
          type="button"
          role="radio"
          aria-checked={value === "in"}
          onClick={() => onChange("in")}
          className={`flex h-14 items-center justify-center gap-2 rounded-lg border-2 text-lg font-bold transition-colors ${
            value === "in" ? "border-green-700 bg-green-600 text-white shadow-md" : "border-green-300 bg-white text-green-700 hover:bg-green-50"
          }`}
        >
          <LogIn className="h-5 w-5" />
          دخول
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === "out"}
          onClick={() => onChange("out")}
          className={`flex h-14 items-center justify-center gap-2 rounded-lg border-2 text-lg font-bold transition-colors ${
            value === "out" ? "border-red-700 bg-red-600 text-white shadow-md" : "border-red-300 bg-white text-red-700 hover:bg-red-50"
          }`}
        >
          <LogOut className="h-5 w-5" />
          خروج
        </button>
      </div>
    </div>
  );
}
