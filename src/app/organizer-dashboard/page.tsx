"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CalendarClock, Camera, LogOut, ScanLine, Search } from "lucide-react";
import { playScanSound, unlockScanAudio } from "@/lib/scan-sounds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ParticipantDetailsPanel, { type ParticipantDetails } from "@/components/attendance/participant-details-panel";
import BookingsBoard from "@/components/attendance/bookings-board";
import { formatMinutes, formatTime } from "@/components/attendance/time-format";

// camera lib must never touch SSR
const QrScanner = dynamic(() => import("@/components/attendance/qr-scanner"), { ssr: false });

/**
 * Organizer (منظم) page:
 *  - badge scanner: entries AND exits (any number per day) for the venue or
 *    for one event; every scan shows the participant's full details, team,
 *    members and mentor sessions
 *  - read-only participant lookup (click a row for the same details)
 *  - the day's mentor sessions board, sorted by time
 * No undo — an admin corrects mistakes from the admin attendance page.
 */

interface Me {
  name: string;
  username: string;
  today: string;
}

type Direction = "auto" | "in" | "out";

interface ScanResult {
  kind: "in" | "out" | "duplicate" | "rejected";
  message: string;
  name?: string;
  teamName?: string | null;
  presenceLine?: string;
}

interface RecentScan {
  name: string;
  time: string;
  direction: "in" | "out";
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

const RESULT_STYLES: Record<ScanResult["kind"], string> = {
  in: "bg-green-50 border-green-500 text-green-800",
  out: "bg-blue-50 border-blue-500 text-blue-800",
  duplicate: "bg-yellow-50 border-yellow-500 text-yellow-800",
  rejected: "bg-red-50 border-red-500 text-red-800",
};

const MESSAGES: Record<string, string> = {
  checkedIn: "تم تسجيل الدخول ✓",
  attended: "تم تسجيل الحضور ✓",
  reEntered: "تم تسجيل العودة (دخول) ✓",
  alreadyCheckedIn: "مسجّل دخوله بالفعل",
  alreadyAttended: "مسجّل حضوره بالفعل",
  checkedOut: "تم تسجيل الخروج ✓",
  alreadyOut: "مسجّل خروجه بالفعل",
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
  const [tab, setTab] = useState<"scan" | "search" | "bookings">("scan");

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

  // ---- participant details (after a scan, or from search) --------------------
  const [details, setDetails] = useState<ParticipantDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const loadDetails = useCallback(
    async (participantId: string) => {
      setDetailsLoading(true);
      try {
        const res = await fetch(`/api/organizer/participants/${participantId}`, { credentials: "include" });
        if (res.status === 401) return goToLogin();
        if (res.ok) setDetails(await res.json());
      } catch {
        /* keep the scan result; details are a bonus */
      } finally {
        setDetailsLoading(false);
      }
    },
    [goToLogin]
  );

  // ---- scanner ---------------------------------------------------------------
  const [scope, setScope] = useState<"general" | "event">("general");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [direction, setDirection] = useState<Direction>("auto");
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const scanBusyRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/organizer/events", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {});
  }, []);

  const showResult = (r: ScanResult) => {
    playScanSound(r.kind === "rejected" ? "error" : r.kind === "duplicate" ? "duplicate" : "success");
    setResult(r);
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => setResult(null), 6000);
  };

  const submitCode = useCallback(
    async (badgeCode: string, method: "scan" | "manual") => {
      if (scanBusyRef.current) return;
      if (scope === "event" && !eventId) {
        showResult({ kind: "rejected", message: "اختر الفعالية أولاً" });
        return;
      }
      scanBusyRef.current = true;
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
          const isDuplicate = ["alreadyCheckedIn", "alreadyAttended", "alreadyOut"].includes(payload.result) && !payload.scanId;
          const kind: ScanResult["kind"] = isDuplicate ? "duplicate" : payload.direction === "out" ? "out" : "in";
          showResult({
            kind,
            message: MESSAGES[payload.result] ?? "تم ✓",
            name: payload.fullName,
            teamName: payload.teamName,
            presenceLine: presenceLine(payload.presence),
          });
          if (payload.date) setMe((m) => (m && m.today !== payload.date ? { ...m, today: payload.date } : m));
          if (payload.scanId) {
            setRecent((prev) => [
              { name: payload.fullName, time: formatTime(new Date()), direction: payload.direction },
              ...prev.slice(0, 29),
            ]);
          }
        } else {
          showResult({ kind: "rejected", message: payload.error || "فشل التسجيل", name: payload.fullName, teamName: payload.teamName });
        }
        if (payload.participantId) loadDetails(payload.participantId);
      } catch {
        showResult({ kind: "rejected", message: "تعذر الاتصال بالخادم" });
      } finally {
        scanBusyRef.current = false;
      }
    },
    [goToLogin, direction, scope, eventId, loadDetails]
  );

  const handleDecoded = useCallback(
    (text: string) => {
      const code = text.trim().toUpperCase();
      // legacy DYAM- accepted: badges issued before the rename stay scannable
      if (!code.startsWith("MIYAHTHONE-") && !code.startsWith("DYAM-")) return; // stray QR — ignore silently
      submitCode(code, "scan");
    },
    [submitCode]
  );

  const handleManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    await submitCode(manualCode.trim().toUpperCase(), "manual");
    setManualCode("");
  };

  // ---- search (read-only) ----------------------------------------------------
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== "search") return;
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

  const detailsBlock =
    details || detailsLoading ? (
      detailsLoading && !details ? (
        <p className="text-sm text-muted-foreground">جاري تحميل بيانات المشارك...</p>
      ) : details ? (
        <ParticipantDetailsPanel details={details} onClose={() => setDetails(null)} />
      ) : null
    ) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold sm:text-xl">لوحة المنظم</h1>
            <p className="truncate text-sm text-muted-foreground">{me.name}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="ml-1 h-4 w-4" />
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <Button variant={tab === "scan" ? "default" : "outline"} size="sm" onClick={() => setTab("scan")}>
            <ScanLine className="ml-1 h-4 w-4" />
            مسح البطاقات
          </Button>
          <Button variant={tab === "search" ? "default" : "outline"} size="sm" onClick={() => setTab("search")}>
            <Search className="ml-1 h-4 w-4" />
            البحث عن مشارك
          </Button>
          <Button variant={tab === "bookings" ? "default" : "outline"} size="sm" onClick={() => setTab("bookings")}>
            <CalendarClock className="ml-1 h-4 w-4" />
            جلسات الإرشاد
          </Button>
        </div>

        {tab === "scan" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScanLine className="h-5 w-5" />
                  تسجيل الدخول والخروج
                </CardTitle>
                <CardDescription>
                  امسح رمز QR من بطاقة المشارك أو أدخل رمز البطاقة يدوياً. يُسجَّل بتاريخ اليوم (<span dir="ltr">{me.today}</span>)،
                  ويمكن تسجيل الدخول والخروج أكثر من مرة في اليوم.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* where */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">المكان:</span>
                  <Button size="sm" variant={scope === "general" ? "default" : "outline"} onClick={() => setScope("general")}>
                    الحضور العام (المقر)
                  </Button>
                  <Button size="sm" variant={scope === "event" ? "default" : "outline"} onClick={() => setScope("event")}>
                    فعالية / جلسة
                  </Button>
                  {scope === "event" && (
                    <select
                      className="min-w-[220px] rounded-md border bg-white p-2 text-sm"
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                    >
                      <option value="">اختر الفعالية...</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} — {new Date(ev.startDate).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })} {formatTime(ev.startDate)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* in / out */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">نوع المسح:</span>
                  {([
                    ["auto", "تلقائي (دخول/خروج)"],
                    ["in", "دخول"],
                    ["out", "خروج"],
                  ] as const).map(([v, label]) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={direction === v ? "default" : "outline"}
                      className={direction === v && v === "out" ? "bg-blue-700 hover:bg-blue-800" : direction === v && v === "in" ? "bg-green-700 hover:bg-green-800" : ""}
                      onClick={() => setDirection(v)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  «تلقائي»: إن كان المشارك داخل المكان يُسجَّل خروجه، وإلا يُسجَّل دخوله. استخدم «دخول» عند البوابة و«خروج» عند المخرج إن كان لكل منهما منظم.
                </p>

                {result && (
                  <div className={`rounded-md border-r-4 p-4 ${RESULT_STYLES[result.kind]}`}>
                    <div className="text-lg font-bold">{result.message}</div>
                    {result.name && (
                      <div className="mt-1 text-sm">
                        {result.name}
                        {result.teamName ? ` — فريق ${result.teamName}` : ""}
                      </div>
                    )}
                    {result.presenceLine && <div className="mt-1 text-sm">{result.presenceLine}</div>}
                  </div>
                )}

                {cameraOn ? (
                  <>
                    <QrScanner onScan={handleDecoded} paused={false} />
                    <div className="text-center">
                      <Button variant="outline" size="sm" onClick={() => setCameraOn(false)}>
                        إيقاف الكاميرا
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => { unlockScanAudio(); setCameraOn(true); }} className="bg-blue-600 hover:bg-blue-700">
                      <Camera className="ml-2 h-4 w-4" />
                      تشغيل الكاميرا للمسح
                    </Button>
                  </div>
                )}

                <form onSubmit={handleManual} className="flex flex-col gap-2 md:mx-auto md:max-w-md md:flex-row">
                  <Input
                    dir="ltr"
                    className="text-left font-mono"
                    placeholder="MIYAHTHONE-XXXXXXXXXXXX"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                  />
                  <Button type="submit" variant="outline" disabled={!manualCode.trim()}>
                    تسجيل يدوي
                  </Button>
                </form>

                {recent.length > 0 && (
                  <div className="rounded-md border p-3">
                    <h4 className="mb-2 text-sm font-semibold">آخر عمليات المسح (هذه الجلسة)</h4>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {recent.map((s, i) => (
                        <div key={i} className="text-sm">
                          <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${s.direction === "in" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                            {s.direction === "in" ? "دخول" : "خروج"}
                          </span>
                          {s.name} <span className="text-xs text-muted-foreground">({s.time})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {detailsBlock}
          </>
        )}

        {tab === "search" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  البحث عن مشارك
                </CardTitle>
                <CardDescription>المشاركون النشطون فقط — للعرض فقط. اضغط على مشارك لعرض بياناته وفريقه وحجوزاته.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="ابحث بالاسم أو البريد أو اسم الفريق..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {query.trim().length < 2 ? (
                  <p className="text-sm text-muted-foreground">اكتب حرفين على الأقل للبحث.</p>
                ) : searching && rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">جاري البحث...</p>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
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
                              onClick={() => loadDetails(r.participantId)}
                            >
                              <td className="border p-2 font-medium text-blue-800 underline-offset-2 hover:underline">{r.name}</td>
                              <td className="border p-2">{r.teamName || "بدون فريق"}</td>
                              <td className="border p-2" dir="ltr">{r.email}</td>
                              <td className="border p-2">
                                {r.checkedInToday ? (
                                  <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
                                    حاضر{r.checkedInAt ? ` — ${formatTime(r.checkedInAt)}` : ""}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">لم يسجل بعد</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {truncated && (
                      <p className="text-xs text-muted-foreground">تظهر أول 50 نتيجة — حدّد البحث أكثر.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            {detailsBlock}
          </>
        )}

        {tab === "bookings" && <BookingsBoard onUnauthorized={goToLogin} />}
      </main>
    </div>
  );
}
