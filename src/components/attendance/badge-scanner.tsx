"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, CameraOff, Eye, ScanLine } from "lucide-react";
import { unlockScanAudio } from "@/lib/scan-sounds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// camera lib must never touch SSR
const QrScanner = dynamic(() => import("@/components/attendance/qr-scanner"), { ssr: false });

export type ScanFlash = { kind: "in" | "out" | "duplicate" | "rejected"; key: number } | null;

const FLASH_RING: Record<NonNullable<ScanFlash>["kind"], string> = {
  in: "ring-8 ring-green-500",
  out: "ring-8 ring-red-500",
  duplicate: "ring-8 ring-yellow-400",
  rejected: "ring-8 ring-gray-900",
};

/** Typed codes: spaces dropped, upper-cased, and the badge prefix added when only the tail was typed. */
export function normalizeBadgeCode(raw: string): string {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (!code) return "";
  return code.startsWith("MIYAHTHONE-") || code.startsWith("DYAM-") ? code : `MIYAHTHONE-${code.replace(/^-+/, "")}`;
}

/**
 * Camera + manual badge entry, placed in each organizer tab. `tone` makes it
 * obvious what a scan does there: "in" (green) records an entry, "out" (red)
 * records an exit, "view" (gray) only shows information. Only badge-shaped
 * codes are passed on.
 *
 * Phone-friendly: the `result` is shown right under the camera in a space that
 * is always reserved (the camera never jumps), the frame flashes the result
 * colour, the camera turns itself back on when it was on last time (`cameraKey`),
 * and the screen is kept awake while the camera runs.
 */
export default function BadgeScanner({
  tone,
  label,
  busy = false,
  onCode,
  result,
  flash = null,
  cameraKey,
}: {
  tone: "in" | "out" | "view";
  label: React.ReactNode;
  busy?: boolean;
  onCode: (code: string, method: "scan" | "manual") => void;
  /** feedback shown under the camera (space reserved when empty) */
  result?: React.ReactNode;
  flash?: ScanFlash;
  /** remember camera on/off on this device under this key */
  cameraKey?: string;
}) {
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [flashing, setFlashing] = useState<NonNullable<ScanFlash>["kind"] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // camera on/off remembered per device
  useEffect(() => {
    if (!cameraKey) return;
    try {
      if (localStorage.getItem(cameraKey) === "on") setCameraOn(true);
    } catch {
      /* storage unavailable */
    }
  }, [cameraKey]);
  const setCamera = (on: boolean) => {
    if (on) unlockScanAudio();
    setCameraOn(on);
    if (cameraKey) {
      try {
        localStorage.setItem(cameraKey, on ? "on" : "off");
      } catch {
        /* not remembered */
      }
    }
  };

  // keep the screen awake while scanning (where supported)
  useEffect(() => {
    if (!cameraOn) return;
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* not supported / denied */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [cameraOn]);

  // flash the frame in the result colour
  useEffect(() => {
    if (!flash) return;
    setFlashing(flash.kind);
    const t = setTimeout(() => setFlashing(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const handleDecoded = (text: string) => {
    const code = text.trim().toUpperCase();
    // legacy DYAM- accepted: badges issued before the rename stay scannable
    if (!code.startsWith("MIYAHTHONE-") && !code.startsWith("DYAM-")) return; // stray QR — ignore silently
    onCode(code, "scan");
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeBadgeCode(manualCode);
    if (!code || busy) return;
    onCode(code, "manual");
    setManualCode("");
    inputRef.current?.focus(); // ready for the next code
  };

  const record = tone !== "view";
  const frame = tone === "in" ? "border-green-500 bg-green-50" : tone === "out" ? "border-red-500 bg-red-50" : "border-gray-300 bg-gray-50";
  const text = tone === "in" ? "text-green-800" : tone === "out" ? "text-red-800" : "text-gray-700";
  const button = tone === "in" ? "bg-green-700 hover:bg-green-800" : tone === "out" ? "bg-red-700 hover:bg-red-800" : "bg-gray-700 hover:bg-gray-800";
  return (
    <div className={`space-y-3 rounded-xl border-2 p-3 transition-shadow duration-300 ${frame} ${flashing ? FLASH_RING[flashing] : ""}`}>
      <div className={`flex items-center justify-between gap-2 text-sm font-semibold ${text}`}>
        <span className="flex min-w-0 items-center gap-2">
          {record ? <ScanLine className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">{label}</span>
        </span>
        {busy && <span className="shrink-0 text-xs font-normal text-muted-foreground">جاري المعالجة...</span>}
      </div>

      {cameraOn ? (
        <>
          <QrScanner onScan={handleDecoded} paused={busy} />
          <div className="text-center">
            <Button variant="outline" size="sm" className="bg-white" onClick={() => setCamera(false)}>
              <CameraOff className="ml-1 h-4 w-4" />
              إيقاف الكاميرا
            </Button>
          </div>
        </>
      ) : (
        <Button onClick={() => setCamera(true)} className={`h-12 w-full text-base ${button}`}>
          <Camera className="ml-2 h-5 w-5" />
          تشغيل الكاميرا للمسح
        </Button>
      )}

      {result !== undefined && <div className="min-h-[92px]">{result}</div>}

      <form onSubmit={submitManual} className="flex gap-2">
        <Input
          ref={inputRef}
          // Arabic placeholder reads right-to-left; the typed code is LTR monospace
          dir={manualCode ? "ltr" : "rtl"}
          className={`h-11 bg-white ${manualCode ? "text-left font-mono" : "text-right"}`}
          placeholder="اكتب رمز البطاقة يدوياً"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <Button type="submit" variant="outline" className="h-11 shrink-0 bg-white" disabled={!manualCode.trim() || busy}>
          {record ? "تسجيل" : "عرض"}
        </Button>
      </form>
    </div>
  );
}
