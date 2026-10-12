"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRange, formatTime } from "./time-format";

interface BoardBooking {
  id: string;
  startTime: string;
  endTime: string;
  mentorName: string;
  mentorOrganization: string | null;
  bookedThroughOrganization: string | null;
  teamName: string | null;
  bookedBy: string;
  members: string[];
}

/**
 * Organizer board: today's mentor sessions, earliest first. A session leaves
 * the board once it has ended (time moves on by itself — no reload needed);
 * the one running now is pinned on top, then the next start time.
 */
export default function BookingsBoard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [date, setDate] = useState("");
  const [bookings, setBookings] = useState<BoardBooking[]>([]);
  const [skew, setSkew] = useState(0); // server clock - browser clock
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer/bookings${date ? `?date=${date}` : ""}`, { credentials: "include" });
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (res.ok) {
        setBookings(data.bookings ?? []);
        setSkew(new Date(data.serverNow).getTime() - Date.now());
        if (!date) setDate(data.date);
      }
    } finally {
      setLoading(false);
    }
  }, [date, onUnauthorized]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refetch = setInterval(load, 60_000); // new bookings / cancellations
    const tick = setInterval(() => setNow(Date.now()), 15_000); // sessions moving on
    return () => { clearInterval(refetch); clearInterval(tick); };
  }, [load]);

  const serverNow = now + skew;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      if (!showPast && new Date(b.endTime).getTime() <= serverNow) return false;
      if (!q) return true;
      return [b.teamName, b.mentorName, b.mentorOrganization, b.bookedBy, ...b.members].some((x) => (x ?? "").toLowerCase().includes(q));
    });
  }, [bookings, query, showPast, serverNow]);

  // group by start time, in order
  const groups = useMemo(() => {
    const map = new Map<string, BoardBooking[]>();
    for (const b of visible) {
      const k = b.startTime;
      const g = map.get(k);
      if (g) g.push(b);
      else map.set(k, [b]);
    }
    return Array.from(map.entries());
  }, [visible]);
  const nextStart = groups.find(([start]) => new Date(start).getTime() > serverNow)?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          جلسات الإرشاد — من مع أي موجه
        </CardTitle>
        <CardDescription>
          مرتبة حسب الوقت. الجلسة الجارية في الأعلى، والجلسات المنتهية تختفي تلقائياً. الوقت الآن {formatTime(new Date(serverNow))}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input type="date" dir="ltr" className="sm:w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Input placeholder="ابحث باسم الفريق أو الموجه أو العضو..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="flex items-center gap-1 whitespace-nowrap text-sm">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            إظهار المنتهية
          </label>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="ml-1 h-4 w-4" /> تحديث
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bookings.length === 0 ? "لا توجد حجوزات في هذا اليوم." : "لا توجد جلسات قادمة — فعّل «إظهار المنتهية» لرؤية الجلسات السابقة."}
          </p>
        ) : (
          groups.map(([start, list]) => {
            const s = new Date(start).getTime();
            const e = new Date(list[0].endTime).getTime();
            const isNow = s <= serverNow && serverNow < e;
            const isPast = e <= serverNow;
            const isNext = start === nextStart;
            return (
              <div
                key={start}
                className={`rounded-md border p-3 ${isNow ? "border-green-500 bg-green-50" : isNext ? "border-blue-400 bg-blue-50" : isPast ? "opacity-60" : ""}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 font-semibold">
                  <span>{formatRange(start, list[0].endTime)}</span>
                  {isNow && <span className="rounded bg-green-600 px-2 py-0.5 text-xs text-white">الآن</span>}
                  {isNext && <span className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white">التالي</span>}
                  {isPast && <span className="rounded bg-gray-400 px-2 py-0.5 text-xs text-white">انتهت</span>}
                  <span className="text-xs font-normal text-muted-foreground">{list.length} جلسة</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((b) => (
                    <div key={b.id} className="rounded bg-white/80 p-2 text-sm shadow-sm">
                      <div>
                        <span className="font-semibold">{b.teamName ? `فريق ${b.teamName}` : b.bookedBy}</span>
                        {" ← "}
                        <span className="font-semibold text-blue-800">{b.mentorName}</span>
                        {b.mentorOrganization ? <span className="text-muted-foreground"> ({b.mentorOrganization})</span> : null}
                      </div>
                      {b.teamName && (
                        <div className="text-xs text-muted-foreground">الأعضاء: {b.members.join("، ")}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
