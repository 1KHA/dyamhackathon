"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QrScannerProps {
  /** Called with the decoded text. Repeat decodes of the same code are throttled. */
  onScan: (decodedText: string) => void;
  /** Pause decoding (e.g. while a result banner is showing). Camera keeps running. */
  paused?: boolean;
  /**
   * The same code fires again only after it has been OUT of view this long.
   * Holding a badge in front of the camera therefore never fires twice.
   */
  sameCodeCooldownMs?: number;
}

/**
 * Camera QR scanner built on html5-qrcode.
 *
 * Guards for React 18 StrictMode double-mount (dev): init is flagged via a
 * ref so the second mount does not race the first async start(), and cleanup
 * awaits stop() before clear(). Requires HTTPS or localhost for camera access.
 */
export default function QrScanner({ onScan, paused = false, sameCodeCooldownMs = 5000 }: QrScannerProps) {
  // unique per instance (several scanners can exist on one page); CSS-safe
  const containerId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const cooldownRef = useRef(sameCodeCooldownMs);
  cooldownRef.current = sameCodeCooldownMs;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const startedRef = useRef(false);
  const pausedRef = useRef(paused);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const onScanRef = useRef(onScan);

  pausedRef.current = paused;
  onScanRef.current = onScan;

  useEffect(() => {
    if (startedRef.current) return; // StrictMode second mount
    startedRef.current = true;

    const scanner = new Html5Qrcode(containerId);
    let disposed = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (pausedRef.current) return;
          const now = Date.now();
          // The camera decodes ~10 times a second. The same code is ignored
          // while it stays in view: `at` is the LAST time it was seen, so it
          // only fires again after being away for the cooldown.
          if (lastScanRef.current.text === decodedText && now - lastScanRef.current.at < cooldownRef.current) {
            lastScanRef.current.at = now;
            return;
          }
          lastScanRef.current = { text: decodedText, at: now };
          onScanRef.current(decodedText);
        },
        () => {
          /* per-frame decode misses — noise, ignore */
        }
      )
      .then(() => {
        if (!disposed) setStarting(false);
      })
      .catch((err) => {
        if (!disposed) {
          setStarting(false);
          setError(
            typeof err === "string" ? err : err?.message || "تعذر تشغيل الكاميرا"
          );
        }
      });

    return () => {
      disposed = true;
      const teardown = async () => {
        try {
          if (scanner.isScanning) {
            await scanner.stop();
          }
          scanner.clear();
        } catch {
          /* ignore teardown races */
        }
      };
      teardown();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div
        id={containerId}
        className="w-full max-w-md mx-auto rounded-lg overflow-hidden border bg-black/90 min-h-[240px]"
      />
      {starting && (
        <p className="text-center text-sm text-muted-foreground">جاري تشغيل الكاميرا...</p>
      )}
      {error && (
        <div className="text-center text-sm text-red-500 space-y-1">
          <p>تعذر الوصول إلى الكاميرا: {error}</p>
          <p className="text-muted-foreground">
            تأكد من منح إذن الكاميرا، أو استخدم الإدخال اليدوي أدناه. (الكاميرا تتطلب HTTPS أو
            localhost)
          </p>
        </div>
      )}
    </div>
  );
}
