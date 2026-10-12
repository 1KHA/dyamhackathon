"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Contact, LogOut, RotateCcw, ScanLine, Search } from "lucide-react";
import { playScanSound } from "@/lib/scan-sounds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import BadgeScanner, { type ScanFlash } from "@/components/attendance/badge-scanner";
import ParticipantDetailsPanel, { type ParticipantDetails } from "@/components/attendance/participant-details-panel";
import BookingsBoard from "@/components/attendance/bookings-board";
import { formatMinutes, formatRange, formatTime } from "@/components/attendance/time-format";
import ScanModeToggle, { useRememberedDirection, type ScanDirection } from "@/components/attendance/scan-mode-toggle";

/**
 * Organizer (منظم) page — three tabs, each with its own scanner:
 *  - «تسجيل الدخول والخروج»: the ONLY scanner that records (entry / exit)
 *  - «معلومات المشارك»: scan or search → full details, records nothing
 *  - «جلسات الإرشاد»: the day's sessions; scan → that team's sessions, records nothing
 * An organizer can take back their own scan for a few minutes; older
 * corrections are for an admin.
 */

interface Me {
  name: string;
  username: string;
  today: string;
}

// «تلقائي» (auto) is hidden for now: with several doors and organizers, a scan
// for another reason could record an exit by mistake. The API still accepts it.
type Direction = ScanDirection;

interface ScanResult {
  kind: "in" | "out" | "duplicate" | "rejected";
  message: string;
  name?: string;
  teamName?: string | null;
  presenceLine?: string;
  participantId?: string;
}

interface RecentScan {
  scanId: string;
  name: string;
  where: string;
  time: string;
  at: number;
  direction: "in" | "out";
  undone?: boolean;
}

interface SearchRow {
  participantId: string;
  name: string;
  email: string;
  teamName: string | null;
  checkedInToday: boolean;
  checkedInAt: string | null;
}

interface EventOption {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

const UNDO_MINUTES = 5; // same as ORGANIZER_UNDO_MINUTES on the server

const RESULT_STYLES: Record<ScanResult["kind"], string> = {
  in: "bg-green-50 border-green-500 text-green-800",
  out: "bg-red-50 border-red-600 text-red-800",
  duplicate: "bg-yellow-50 border-yellow-500 text-yellow-800",
  // dark, not red: red means «خروج» on this page
  rejected: "bg-gray-900 border-black text-white",
};

const MESSAGES: Record<string, string> = {
  checkedIn: "تم تسجيل الدخول ✓",
  attended: "تم تسجيل الحضور ✓",
  reEntered: "تم تسجيل العودة (دخول) ✓",
  alreadyCheckedIn: "مسجّل دخوله بالفعل — لم يُسجَّل شيء",
  alreadyAttended: "مسجّل حضوره بالفعل — لم يُسجَّل شيء",
  checkedOut: "تم تسجيل الخروج ✓",
  alreadyOut: "مسجّل خروجه بالفعل — لم يُسجَّل شيء",
};

function presenceLine(p: any): string | undefined {
  if (!p) return undefined;
  const parts = [
    p.state === "inside" ? `داخل منذ ${formatTime(p.insideSince)}` : p.state === "outside" ? `خرج ${formatTime(p.lastOut)}` : "",
    `مدة التواجد ${formatMinutes(p.insideMinutes)}`,
    `مرات الخروج ${p.exits}`,
  ];
  if (p.missedMinutes !== undefined && p.missedMinutes !== null) parts.push(`فاته من الفعالية ${formatMinutes(p.missedMinutes)}`);
  return parts.filter(Boolean).join(" · ");
}

export default function OrganizerDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<"attendance" | "info" | "sessions">("attendance");

  // ---- session ---------------------------------------------------------------
  const goToLogin = useCallback(() => router.replace("/organizer-login"), [router]);

  useEffect(() => {
    fetch("/api/organizer/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return goToLogin();
        const data = await res.json();
        setMe({ name: data.name, username: data.username, today: data.today });
      })
      .catch(goToLogin);
  }, [goToLogin]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {});
    goToLogin();
  };

  // ---- read-only lookups (info + sessions tabs, and «عرض التفاصيل») ------------
  const [infoDetails, setInfoDetails] = useState<ParticipantDetails | null>(null);
  const [sessionsDetails, setSessionsDetails] = useState<ParticipantDetails | null>(null);
  const [attendanceDetails, setAttendanceDetails] = useState<ParticipantDetails | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /** by badge code (scanner) or participant id (search / details button) — never records */
  const lookup = useCallback(
    async (q: { badgeCode?: string; participantId?: string }): Promise<ParticipantDetails | null> => {
      setLookupBusy(true);
      setLookupError(null);
      try {
        const url = q.badgeCode
          ? `/api/organizer/lookup?badgeCode=${encodeURIComponent(q.badgeCode)}`
          : `/api/organizer/participants/${q.participantId}`;
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 401) {
          goToLogin();
          return null;
        }
        const data = await res.json();
        if (!res.ok) {
          setLookupError(data.error || "تعذر جلب البيانات");
          playScanSound("error");
          return null;
        }
        return data as ParticipantDetails;
      } catch {
        setLookupError("تعذر الاتصال بالخادم");
        return null;
      } finally {
        setLookupBusy(false);
      }
    },
    [goToLogin]
  );

  // ---- attendance (the only scanner that records) ------------------------------
  const [scope, setScope] = useState<"general" | "event">("general");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  // remembered per device, so an exit door stays in «خروج» after a reload
  const [direction, setDirection] = useRememberedDirection("miyahthone-scan-direction-organizer");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const scanBusyRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceTick] = useState(0); // re-render so undo buttons expire on time
  const [flash, setFlash] = useState<ScanFlash>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/organizer/events", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {});
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const showResult = (r: ScanResult) => {
    playScanSound(r.kind === "rejected" ? "error" : r.kind === "duplicate" ? "duplicate" : "success");
    // a short buzz on phones that support it: one for OK, two for a problem
    try {
      navigator.vibrate?.(r.kind === "rejected" ? [90, 60, 90] : r.kind === "duplicate" ? [40, 40, 40] : 70);
    } catch {
      /* not supported */
    }
    setFlash({ kind: r.kind, key: Date.now() });
    setResult(r);
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => setResult(null), 10000);
  };

  // details opened below the scanner: bring them into view
  const openDetails = (d: ParticipantDetails | null, set: (d: ParticipantDetails | null) => void) => {
    if (!d) return;
    set(d);
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const recordScan = useCallback(
    async (badgeCode: string, method: "scan" | "manual") => {
      if (scanBusyRef.current) return; // one request at a time per device
      if (scope === "event" && !eventId) {
        showResult({ kind: "rejected", message: "اختر الفعالية أولاً" });
        return;
      }
      scanBusyRef.current = true;
      setScanBusy(true);
      setAttendanceDetails(null);
      try {
        const res = await fetch("/api/organizer/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ badgeCode, method, direction, mode: scope, ...(scope === "event" ? { eventId } : {}) }),
        });
        if (res.status === 401) return goToLogin(); // session expired or account disabled
        const payload = await res.json();
        if (res.ok && payload.success) {
          if (payload.result === "repeatIgnored") {
            showResult({
              kind: "duplicate",
              message: `مسح مكرر — آخر عملية (${payload.direction === "out" ? "خروج" : "دخول"}) قبل ${payload.secondsAgo} ثانية، لم يُسجَّل شيء`,
              name: payload.fullName,
              teamName: payload.teamName,
              presenceLine: `${presenceLine(payload.presence) ?? ""}${payload.direction === "in" ? " — لتسجيل خروجه الآن اختر «خروج»" : " — لتسجيل دخوله الآن اختر «دخول»"}`,
              participantId: payload.participantId,
            });
          } else {
            const kind: ScanResult["kind"] = !payload.scanId ? "duplicate" : payload.direction === "out" ? "out" : "in";
            showResult({
              kind,
              message: payload.autoRegistered
                ? "لم يكن مسجلاً في الفعالية — تم تسجيله وتسجيل دخوله ✓"
                : payload.reactivated
                  ? "كان تسجيله ملغى — أُعيد تسجيله وسُجّل دخوله ✓"
                  : MESSAGES[payload.result] ?? "تم ✓",
              name: payload.fullName,
              teamName: payload.teamName,
              presenceLine: presenceLine(payload.presence),
              participantId: payload.participantId,
            });
            if (payload.scanId) {
              setRecent((prev) => [
                { scanId: payload.scanId, name: payload.fullName, where: payload.eventTitle ?? "الحضور العام", time: formatTime(new Date()), at: Date.now(), direction: payload.direction },
                ...prev.slice(0, 29),
              ]);
            }
          }
          if (payload.date) setMe((m) => (m && m.today !== payload.date ? { ...m, today: payload.date } : m));
        } else {
          showResult({ kind: "rejected", message: payload.error || "فشل التسجيل", name: payload.fullName, teamName: payload.teamName, participantId: payload.participantId });
        }
      } catch {
        showResult({ kind: "rejected", message: "تعذر الاتصال بالخادم — أعد المسح" });
      } finally {
        scanBusyRef.current = false;
        setScanBusy(false);
      }
    },
    [goToLogin, direction, scope, eventId]
  );

  const undo = async (scan: RecentScan) => {
    try {
      const res = await fetch("/api/organizer/scan/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scanId: scan.scanId }),
      });
      if (res.status === 401) return goToLogin();
      const data = await res.json();
      if (!res.ok) {
        showResult({ kind: "rejected", message: data.error || "فشل التراجع" });
        return;
      }
      setRecent((prev) => prev.map((s) => (s.scanId === scan.scanId ? { ...s, undone: true } : s)));
      showResult({ kind: "duplicate", message: `تم التراجع عن ${scan.direction === "in" ? "دخول" : "خروج"} ${scan.name}` });
    } catch {
      showResult({ kind: "rejected", message: "تعذر الاتصال بالخادم" });
    }
  };

  // ---- info tab: search ------------------------------------------------------
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== "info") return;
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/organizer/participants?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.status === 401) return goToLogin();
        const data = await res.json();
        if (!cancelled && res.ok) {
          setRows(data.results ?? []);
          setTruncated(Boolean(data.truncated));
        }
      } catch {
        /* keep last results */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tab, goToLogin]);

  if (!me) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const switchTab = (t: typeof tab) => {
    setTab(t);
    setLookupError(null);
  };

  // sessions tab: the scanned team's sessions today, now/next first
  const todaysSessions = (sessionsDetails?.bookings ?? []).filter(
    (b) => b.upcoming && new Date(b.startTime).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) === me.today
  );

  // event picker: today's first (running one marked), then upcoming, then past
  const evDay = (d: string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const nowMs = Date.now();
  const isRunning = (e: EventOption) => new Date(e.startDate).getTime() <= nowMs && nowMs < new Date(e.endDate).getTime();
  const rank = (e: EventOption) => (evDay(e.startDate) === me.today ? 0 : new Date(e.startDate).getTime() > nowMs ? 1 : 2);
  const sortedEvents = [...events].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 2
        ? new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        : new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  );
  const selectedEvent = events.find((e) => e.id === eventId) ?? null;
  const chooseEventScope = () => {
    setScope("event");
    if (!eventId) {
      const running = sortedEvents.find(isRunning);
      if (running) setEventId(running.id);
    }
  };
  const whereLabel = scope === "general" ? "الحضور العام (المقر)" : selectedEvent ? selectedEvent.title : "اختر الفعالية";
  const counts = recent.reduce((c, s) => (s.undone ? c : { ...c, [s.direction]: c[s.direction] + 1 }), { in: 0, out: 0 });

  const resultCard = result ? (
    <div className={`rounded-lg border-r-4 p-3 ${RESULT_STYLES[result.kind]}`}>
      <div className="flex flex-wrap items-center gap-2">
        {(result.kind === "in" || result.kind === "out") && (
          <span className={`rounded px-2 py-0.5 text-sm font-bold text-white ${result.kind === "in" ? "bg-green-600" : "bg-red-600"}`}>
            {result.kind === "in" ? "دخول" : "خروج"}
          </span>
        )}
        <span className="text-base font-bold sm:text-lg">{result.kind === "rejected" ? `✕ ${result.message}` : result.message}</span>
      </div>
      {result.name && (
        <div className="mt-1 text-sm font-medium">
          {result.name}
          {result.teamName ? ` — فريق ${result.teamName}` : ""}
        </div>
      )}
      {result.presenceLine && <div className="mt-1 text-xs sm:text-sm">{result.presenceLine}</div>}
      {result.participantId && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 bg-white text-gray-900 hover:bg-gray-100"
          onClick={async () => openDetails(await lookup({ participantId: result.participantId! }), setAttendanceDetails)}
        >
          عرض التفاصيل
        </Button>
      )}
    </div>
  ) : (
    <div className="flex h-[92px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      جاهز للمسح — وجّه الكاميرا إلى رمز QR أو أدخل الرمز
    </div>
  );

  const TABS = [
    { id: "attendance" as const, icon: ScanLine, short: "الحضور", full: "تسجيل الدخول والخروج" },
    { id: "info" as const, icon: Contact, short: "معلومات", full: "معلومات المشارك" },
    { id: "sessions" as const, icon: CalendarClock, short: "الجلسات", full: "جلسات الإرشاد" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-2 sm:p-4">
          <div className="min-w-0">
            <h1 className="text-base font-bold sm:text-xl">لوحة المنظم</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              {me.name} · <span dir="ltr">{me.today}</span>
            </p>
          </div>
          {/* not «خروج» alone: that word is the exit scan mode on this page */}
          <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={logout}>
            <LogOut className="ml-1 h-4 w-4" />
            خروج من الحساب
          </Button>
        </div>
      </header>

      {/* one row of tabs, always visible */}
      <nav className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-1 p-1.5 sm:gap-2 sm:p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-label={t.full}
              aria-pressed={tab === t.id}
              onClick={() => switchTab(t.id)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm ${
                tab === t.id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.full}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-3 p-3 sm:space-y-4 sm:p-4">
        {/* ================= attendance: records ================= */}
        {tab === "attendance" && (
          <>
            <Card>
              <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
                {/* where */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">المكان:</div>
                  {/* same size as the «دخول / خروج» buttons below */}
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="المكان">
                    {([
                      ["general", "الحضور العام (المقر)", () => setScope("general")],
                      ["event", "فعالية / جلسة", chooseEventScope],
                    ] as const).map(([value, label, onClick]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={scope === value}
                        onClick={onClick}
                        className={`flex h-14 items-center justify-center rounded-lg border-2 px-2 text-base font-bold transition-colors sm:text-lg ${
                          scope === value
                            ? "border-blue-800 bg-primary text-primary-foreground shadow-md"
                            : "border-blue-200 bg-white text-blue-800 hover:bg-blue-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {scope === "event" && (
                    <select
                      className="h-11 w-full rounded-md border bg-white px-2 text-sm"
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                    >
                      <option value="">اختر الفعالية...</option>
                      {sortedEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {isRunning(ev) ? "● الآن — " : ""}
                          {ev.title} — {evDay(ev.startDate) === me.today ? "اليوم" : new Date(ev.startDate).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short" })} {formatTime(ev.startDate)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* in / out */}
                <ScanModeToggle value={direction} onChange={setDirection} />

                <BadgeScanner
                  tone={direction}
                  label={
                    <>
                      يسجّل الآن: <span className="font-extrabold">{direction === "in" ? "دخول" : "خروج"}</span> — {whereLabel}
                    </>
                  }
                  busy={scanBusy}
                  onCode={recordScan}
                  result={resultCard}
                  flash={flash}
                  cameraKey="miyahthone-camera-organizer-attendance"
                />

                {recent.length > 0 && (
                  <div className="rounded-md border p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">آخر عمليات المسح</h4>
                      <span className="text-xs text-muted-foreground">
                        على هذا الجهاز: <span className="font-semibold text-green-700">{counts.in} دخول</span> ·{" "}
                        <span className="font-semibold text-red-700">{counts.out} خروج</span> — التراجع خلال {UNDO_MINUTES} دقائق
                      </span>
                    </div>
                    <div className="max-h-56 divide-y overflow-y-auto">
                      {recent.map((s) => {
                        const canUndo = !s.undone && Date.now() - s.at < UNDO_MINUTES * 60_000;
                        return (
                          <div key={s.scanId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                            <span className={`min-w-0 ${s.undone ? "text-muted-foreground line-through" : ""}`}>
                              <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${s.direction === "in" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                {s.direction === "in" ? "دخول" : "خروج"}
                              </span>
                              {s.name}
                              <span className="block text-xs text-muted-foreground">
                                {s.time} · {s.where}
                              </span>
                            </span>
                            {canUndo && (
                              <button
                                type="button"
                                onClick={() => undo(s)}
                                className="flex shrink-0 items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                <RotateCcw className="h-3 w-3" />
                                تراجع
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {attendanceDetails && (
              <div ref={detailsRef} className="scroll-mt-16">
                <ParticipantDetailsPanel details={attendanceDetails} onClose={() => setAttendanceDetails(null)} />
              </div>
            )}
          </>
        )}

        {/* ================= info: view only ================= */}
        {tab === "info" && (
          <>
            <Card>
              <CardHeader className="p-3 pb-0 sm:p-6 sm:pb-0">
                <CardTitle className="flex items-center gap-2 text-base sm:text-xl">
                  <Contact className="h-5 w-5" />
                  معلومات المشارك
                </CardTitle>
                <CardDescription>امسح البطاقة أو ابحث بالاسم لعرض بيانات المشارك وفريقه وجلساته — لا يُسجَّل أي حضور هنا.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-3 sm:p-6">
                <BadgeScanner
                  tone="view"
                  label="مسح للعرض فقط — لا يُسجَّل حضور"
                  busy={lookupBusy}
                  cameraKey="miyahthone-camera-organizer-info"
                  onCode={async (code) => {
                    const d = await lookup({ badgeCode: code });
                    if (d) {
                      playScanSound("success");
                      openDetails(d, setInfoDetails);
                    }
                  }}
                />
                {lookupError && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{lookupError}</p>}
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pr-10" placeholder="أو ابحث بالاسم أو البريد أو اسم الفريق..." value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {query.trim().length >= 2 &&
                  (searching && rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">جاري البحث...</p>
                  ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
                  ) : (
                    <>
                      {/* phones: tappable cards */}
                      <div className="space-y-2 sm:hidden">
                        {rows.map((r) => (
                          <button
                            key={r.participantId}
                            type="button"
                            className="w-full rounded-lg border bg-white p-3 text-right hover:bg-blue-50"
                            onClick={async () => openDetails(await lookup({ participantId: r.participantId }), setInfoDetails)}
                          >
                            <div className="font-semibold text-blue-800">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.teamName ? `فريق ${r.teamName}` : "بدون فريق"}</div>
                            <div className="mt-1 text-xs">
                              {r.checkedInToday ? (
                                <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">حاضر اليوم{r.checkedInAt ? ` — ${formatTime(r.checkedInAt)}` : ""}</span>
                              ) : (
                                <span className="text-muted-foreground">لم يسجل اليوم</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="hidden overflow-x-auto sm:block">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="border p-2 text-right">الاسم</th>
                              <th className="border p-2 text-right">الفريق</th>
                              <th className="border p-2 text-right">البريد الإلكتروني</th>
                              <th className="border p-2 text-right">حضور اليوم</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr
                                key={r.participantId}
                                className="cursor-pointer hover:bg-blue-50"
                                onClick={async () => openDetails(await lookup({ participantId: r.participantId }), setInfoDetails)}
                              >
                                <td className="border p-2 font-medium text-blue-800">{r.name}</td>
                                <td className="border p-2">{r.teamName || "بدون فريق"}</td>
                                <td className="border p-2" dir="ltr">{r.email}</td>
                                <td className="border p-2">
                                  {r.checkedInToday ? (
                                    <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">حاضر{r.checkedInAt ? ` — ${formatTime(r.checkedInAt)}` : ""}</span>
                                  ) : (
                                    <span className="text-muted-foreground">لم يسجل بعد</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {truncated && <p className="text-xs text-muted-foreground">تظهر أول 50 نتيجة — حدّد البحث أكثر.</p>}
                    </>
                  ))}
              </CardContent>
            </Card>
            {infoDetails && (
              <div ref={detailsRef} className="scroll-mt-16">
                <ParticipantDetailsPanel details={infoDetails} onClose={() => setInfoDetails(null)} />
              </div>
            )}
          </>
        )}

        {/* ================= sessions: view only ================= */}
        {tab === "sessions" && (
          <>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <BadgeScanner
                  tone="view"
                  label="مسح البطاقة لمعرفة جلسة الفريق — للعرض فقط"
                  busy={lookupBusy}
                  cameraKey="miyahthone-camera-organizer-sessions"
                  onCode={async (code) => {
                    const d = await lookup({ badgeCode: code });
                    if (d) {
                      playScanSound("success");
                      setSessionsDetails(d);
                    }
                  }}
                />
                {lookupError && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{lookupError}</p>}
                {sessionsDetails && (
                  <div className="rounded-md border-2 border-orange-300 bg-orange-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">
                        {sessionsDetails.participant.name}
                        {sessionsDetails.team ? ` — فريق ${sessionsDetails.team.name}` : " — مشارك فردي"}
                      </div>
                      <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSessionsDetails(null)}>
                        إخفاء
                      </button>
                    </div>
                    {todaysSessions.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">لا توجد جلسات قادمة اليوم.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {todaysSessions.map((b, i) => {
                          const isNow = new Date(b.startTime).getTime() <= Date.now();
                          return (
                            <div key={b.id} className="text-sm">
                              <span className={`ml-1 rounded px-1.5 py-0.5 text-xs text-white ${isNow ? "bg-green-600" : i === 0 ? "bg-blue-600" : "bg-gray-500"}`}>
                                {isNow ? "الآن" : i === 0 ? "التالية" : "لاحقاً"}
                              </span>
                              <span className="font-semibold">{formatRange(b.startTime, b.endTime)}</span> مع{" "}
                              <span className="font-semibold text-blue-800">{b.mentorName}</span>
                              {b.mentorOrganization ? ` (${b.mentorOrganization})` : ""}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <BookingsBoard
              onUnauthorized={goToLogin}
              highlight={
                sessionsDetails
                  ? {
                      teamName: sessionsDetails.team?.name ?? null,
                      names: sessionsDetails.team ? sessionsDetails.team.members.map((m) => m.name) : [sessionsDetails.participant.name],
                    }
                  : null
              }
            />
          </>
        )}
      </main>
    </div>
  );
}
