"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, ChevronDown, Phone, RefreshCw, User, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRange, formatTime } from "./time-format";

interface Contact {
  name: string;
  phone: string | null;
  isLeader: boolean;
}

interface BoardBooking {
  id: string;
  startTime: string;
  endTime: string;
  mentorName: string;
  mentorOrganization: string | null;
  bookedThroughOrganization: string | null;
  teamName: string | null;
  bookedBy: string;
  booker: Contact;
  /** team leader, or the person themself for an individual booking */
  leader: Contact | null;
  /** leader first */
  members: Contact[];
}

/** tel: link — spaces and dashes dropped, a leading + kept. */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Big one-tap call button (full width on phones). */
function CallButton({ who, person }: { who: string; person: Contact }) {
  if (!person.phone) {
    return (
      <div className="flex h-11 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        لا يوجد رقم جوال لـ{who} ({person.name})
      </div>
    );
  }
  return (
    <a
      href={telHref(person.phone)}
      className="flex min-h-11 items-center justify-between gap-2 rounded-md bg-green-600 px-3 py-2 text-white shadow-sm active:bg-green-700"
    >
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <Phone className="h-4 w-4 shrink-0" />
        <span className="truncate">
          اتصال بـ{who} — {person.name}
        </span>
      </span>
      <span dir="ltr" className="shrink-0 font-mono text-sm">
        {person.phone}
      </span>
    </a>
  );
}

/**
 * Organizer board: today's mentor sessions, earliest first. A session leaves
 * the board once it has ended (time moves on by itself — no reload needed);
 * the one running now is pinned on top, then the next start time.
 *
 * Each session is a card built for phones: who booked (team / person), which
 * mentor or organization, a one-tap call button for the team leader, and the
 * members with their numbers (open for the running and next sessions).
 */
export default function BookingsBoard({
  onUnauthorized,
  highlight = null,
}: {
  onUnauthorized: () => void;
  /** a scanned team / person: their sessions are highlighted */
  highlight?: { teamName: string | null; names: string[] } | null;
}) {
  const [date, setDate] = useState("");
  const [bookings, setBookings] = useState<BoardBooking[]>([]);
  const [skew, setSkew] = useState(0); // server clock - browser clock
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);
  // members list open/closed per booking (default: open for now / next)
  const [openMembers, setOpenMembers] = useState<Record<string, boolean>>({});

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
    const digits = q.replace(/\D/g, "");
    return bookings.filter((b) => {
      if (!showPast && new Date(b.endTime).getTime() <= serverNow) return false;
      if (!q) return true;
      const text = [b.teamName, b.mentorName, b.mentorOrganization, b.bookedThroughOrganization, b.bookedBy, ...b.members.map((m) => m.name)];
      if (text.some((x) => (x ?? "").toLowerCase().includes(q))) return true;
      // a phone number typed in any format
      return digits.length >= 3 && b.members.some((m) => (m.phone ?? "").replace(/\D/g, "").includes(digits));
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
  const isHighlighted = (b: BoardBooking) =>
    !!highlight &&
    ((!!highlight.teamName && b.teamName === highlight.teamName) ||
      highlight.names.some((n) => b.bookedBy === n || b.members.some((m) => m.name === n)));

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
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input type="date" dir="ltr" className="h-11 sm:h-10 sm:w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Input
            className="h-11 sm:h-10"
            placeholder="ابحث بالفريق أو الموجه أو الجهة أو العضو أو رقم الجوال..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1 whitespace-nowrap text-sm">
              <input type="checkbox" className="h-4 w-4" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              إظهار المنتهية
            </label>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="ml-1 h-4 w-4" /> تحديث
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bookings.length === 0 ? "لا توجد حجوزات في هذا اليوم." : "لا توجد جلسات — جرّب بحثاً آخر أو فعّل «إظهار المنتهية» لرؤية الجلسات السابقة."}
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
                className={`rounded-lg border p-2 sm:p-3 ${isNow ? "border-green-500 bg-green-50" : isNext ? "border-blue-400 bg-blue-50" : isPast ? "opacity-60" : "bg-muted/30"}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1 font-semibold">
                  <span className="text-base">{formatRange(start, list[0].endTime)}</span>
                  {isNow && <span className="rounded bg-green-600 px-2 py-0.5 text-xs text-white">الآن</span>}
                  {isNext && <span className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white">التالي</span>}
                  {isPast && <span className="rounded bg-gray-400 px-2 py-0.5 text-xs text-white">انتهت</span>}
                  <span className="text-xs font-normal text-muted-foreground">{list.length} جلسة</span>
                </div>
                <div className="space-y-2">
                  {list.map((b) => {
                    const membersOpen = openMembers[b.id] ?? (isNow || isNext);
                    const viaOrg = b.bookedThroughOrganization;
                    return (
                      <div
                        key={b.id}
                        className={`space-y-2 rounded-md p-3 text-sm shadow-sm ${isHighlighted(b) ? "bg-orange-50 ring-2 ring-orange-400" : "bg-white"}`}
                      >
                        {/* who */}
                        <div>
                          <div className="flex items-center gap-1.5 text-base font-bold">
                            {b.teamName ? <Users className="h-4 w-4 shrink-0" /> : <User className="h-4 w-4 shrink-0" />}
                            <span className="min-w-0 break-words">{b.teamName ? `فريق ${b.teamName}` : `${b.bookedBy} (فردي)`}</span>
                          </div>
                          {b.teamName && <div className="text-xs text-muted-foreground">حجزها: {b.bookedBy}</div>}
                        </div>

                        {/* with whom: the organization (when booked through it) and the mentor */}
                        <div className="space-y-1 rounded-md bg-blue-50 p-2">
                          {viaOrg && (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-4 w-4 shrink-0 text-blue-700" />
                              <span className="text-muted-foreground">الجهة:</span>
                              <span className="font-semibold text-blue-900">{viaOrg}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <UserRound className="h-4 w-4 shrink-0 text-blue-700" />
                            <span className="text-muted-foreground">الموجه:</span>
                            <span className="font-semibold text-blue-900">{b.mentorName}</span>
                            {!viaOrg && b.mentorOrganization && <span className="text-xs text-muted-foreground">({b.mentorOrganization})</span>}
                          </div>
                        </div>

                        {/* one-tap call */}
                        {b.leader ? (
                          <CallButton who={b.teamName ? "القائد" : "المشارك"} person={b.leader} />
                        ) : (
                          <div className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">لا يوجد قائد لهذا الفريق</div>
                        )}
                        {/* the booker is not the leader: their number too */}
                        {b.teamName && !b.booker.isLeader && b.booker.phone && <CallButton who="من حجز" person={b.booker} />}

                        {/* members and their numbers */}
                        {b.teamName && b.members.length > 0 && (
                          <div className="rounded-md border">
                            <button
                              type="button"
                              className="flex h-10 w-full items-center justify-between px-3 text-right font-semibold"
                              onClick={() => setOpenMembers((o) => ({ ...o, [b.id]: !membersOpen }))}
                              aria-expanded={membersOpen}
                            >
                              <span>الأعضاء وأرقامهم ({b.members.length})</span>
                              <ChevronDown className={`h-4 w-4 transition-transform ${membersOpen ? "rotate-180" : ""}`} />
                            </button>
                            {membersOpen && (
                              <ul className="divide-y border-t">
                                {b.members.map((m, i) => (
                                  <li key={`${m.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
                                    <span className="min-w-0 break-words">
                                      {m.name}
                                      {m.isLeader && <span className="mr-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">قائد</span>}
                                    </span>
                                    {m.phone ? (
                                      <a
                                        href={telHref(m.phone)}
                                        dir="ltr"
                                        className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-green-600 px-2 font-mono text-xs text-green-700 active:bg-green-50"
                                      >
                                        <Phone className="h-3.5 w-3.5" />
                                        {m.phone}
                                      </a>
                                    ) : (
                                      <span className="shrink-0 text-xs text-muted-foreground">لا يوجد رقم</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
