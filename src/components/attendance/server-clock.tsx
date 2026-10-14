"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { formatTime } from "./time-format";

/**
 * The server's clock on scan screens. A phone's own clock can be wrong (set by
 * hand, or a different timezone with the time adjusted to "look" right), and
 * then times built from Date.now() came out hours off — e.g. a scan at 09:00
 * Riyadh listed as 07:00. Every server response carries `serverNow`; `sync()`
 * stores the difference and `now()` is the server's time on this phone.
 */
export function useServerClock() {
  const skewRef = useRef(0);
  const [skew, setSkew] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000); // the clock moves on
    return () => clearInterval(t);
  }, []);

  const sync = useCallback((serverNow?: string | null) => {
    if (!serverNow) return;
    const s = new Date(serverNow).getTime() - Date.now();
    if (!Number.isFinite(s)) return;
    skewRef.current = s;
    setSkew(s);
  }, []);

  const now = useCallback(() => Date.now() + skewRef.current, []);
  return { now, sync, skew };
}

const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * «توقيت الرياض الآن 09:24» from the server clock. When the phone itself shows
 * a different time (wrong clock or another timezone), a short note says that
 * the times on this screen are Riyadh time — so 09:24 here vs 11:24 on the
 * phone's status bar is not mistaken for an error.
 */
export function RiyadhClock({ now }: { now: () => number }) {
  const riyadh = formatTime(new Date(now()));
  const d = new Date(); // what the phone's own status bar shows
  const device = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  let diff = Math.abs(minutesOfDay(device) - minutesOfDay(riyadh));
  diff = Math.min(diff, 1440 - diff);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-semibold text-blue-800 sm:text-sm">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        توقيت الرياض الآن <span dir="ltr">{riyadh}</span>
      </div>
      {diff >= 5 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          ساعة جوالك تعرض <span dir="ltr">{device}</span> — كل الأوقات في هذه الصفحة بتوقيت الرياض (<span dir="ltr">{riyadh}</span>) وتُسجَّل بساعة الخادم.
        </div>
      )}
    </div>
  );
}
