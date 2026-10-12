"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as XLSX from "xlsx";
import { Camera, Download, RotateCcw, ScanLine, Search, Volume2, VolumeX } from "lucide-react";
import { playScanSound, unlockScanAudio, isScanSoundMuted, setScanSoundMuted } from "@/lib/scan-sounds";
import { riyadhToday } from "@/lib/badge-dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatMinutes, formatTime } from "@/components/attendance/time-format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "../../../../components/ui/use-toast";

// camera lib must never touch SSR
const QrScanner = dynamic(() => import("@/components/attendance/qr-scanner"), { ssr: false });

interface EventOption {
  id: string;
  title: string;
  startDate: string;
}

interface ScanResult {
  kind:
    | "attended" | "wasAbsent" | "alreadyAttended" | "checkedIn" | "alreadyCheckedIn"
    | "reEntered" | "checkedOut" | "alreadyOut" | "rejected";
  message: string;
  /** time inside / exits after this scan */
  presenceLine?: string;
  name?: string;
  teamName?: string | null;
  participantId?: string;
  /** General mode: the day the check-in was saved under (server's Riyadh date). */
  date?: string;
}

interface SessionScan {
  participantId: string;
  name: string;
  time: string;
  /** the logged entry/exit — undo removes exactly this scan */
  scanId?: string;
  direction?: "in" | "out";
  /** this scan created the day's check-in / the event attendance */
  createdCheckin?: boolean;
  /** General mode: the day this check-in was saved under — undo targets it. */
  date?: string;
  undone?: boolean;
}

interface AttendanceRow {
  registrationId?: string;
  participantId: string;
  name: string;
  email: string;
  teamName: string | null;
  status?: string;
  scannedAt?: string | null;
  time?: string;
  method?: string | null;
}

interface AttendanceData {
  mode: "event" | "general";
  date?: string;
  event?: { id: string; title: string };
  counts: Record<string, number>;
  rows?: AttendanceRow[];
  checkedIn?: AttendanceRow[];
  notCheckedIn?: AttendanceRow[];
}

interface PresenceSummary {
  state: "inside" | "outside" | "none";
  firstIn: string | null;
  lastOut: string | null;
  insideSince: string | null;
  insideMinutes: number;
  outsideMinutes: number;
  exits: number;
  missingCheckout: boolean;
  lateMinutes?: number | null;
  leftEarlyMinutes?: number | null;
  missedMinutes?: number | null;
}

interface PresenceRow {
  participantId: string;
  name: string;
  email: string;
  teamName: string | null;
  summary: PresenceSummary;
  scans: { id: string; direction: string; at: string; by: string; method: string }[];
}

interface PresenceData {
  mode: "event" | "general";
  date: string;
  counts: { people: number; insideNow: number; scans: number; exits: number };
  rows: PresenceRow[];
}

function presenceLine(p: PresenceSummary | undefined): string | undefined {
  if (!p) return undefined;
  const parts = [
    p.state === "inside" ? `داخل منذ ${formatTime(p.insideSince)}` : p.state === "outside" ? `خرج ${formatTime(p.lastOut)}` : "",
    `مدة التواجد ${formatMinutes(p.insideMinutes)}`,
    `مرات الخروج ${p.exits}`,
  ];
  if (p.missedMinutes !== undefined && p.missedMinutes !== null) parts.push(`فاته من الفعالية ${formatMinutes(p.missedMinutes)}`);
  return parts.filter(Boolean).join(" · ");
}

const STATUS_LABELS: Record<string, string> = {
  registered: "مسجل",
  attended: "حاضر",
  absent: "غائب",
  cancelled: "ملغى",
};

const STATUS_PILL: Record<string, string> = {
  registered: "bg-blue-100 text-blue-800",
  attended: "bg-green-100 text-green-800",
  absent: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function AttendancePage() {
  const [mode, setMode] = useState<"event" | "general">("event");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string>("");
  // General mode: `date` only picks which day's list is shown. A check-in is
  // always saved under the server's today (Asia/Riyadh), whatever is picked.
  const [date, setDate] = useState<string>("");
  const dateRef = useRef("");
  dateRef.current = date;
  const [today, setToday] = useState<string>("");
  const todayRef = useRef("");
  const [cameraOn, setCameraOn] = useState(false);
  // auto = exit if inside now, entry otherwise
  const [direction, setDirection] = useState<"auto" | "in" | "out">("auto");
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Audible scan feedback (preference remembered per browser)
  const [soundMuted, setSoundMuted] = useState(false);
  useEffect(() => { setSoundMuted(isScanSoundMuted()); }, []);
  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    setScanSoundMuted(next);
    if (!next) { unlockScanAudio(); playScanSound("success"); } // preview when turning on
  };
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [sessionScans, setSessionScans] = useState<SessionScan[]>([]);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const scanBusyRef = useRef(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // events for the picker
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/events", { credentials: "include" });
        if (res.ok) {
          const list = await res.json();
          setEvents(
            (Array.isArray(list) ? list : []).map((e: any) => ({
              id: e.id,
              title: e.title,
              startDate: e.startDate,
            }))
          );
        }
      } catch {
        /* picker stays empty */
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (mode === "event" && !eventId) {
      setData(null);
      return;
    }
    try {
      const qs =
        mode === "event"
          ? `mode=event&eventId=${encodeURIComponent(eventId)}`
          : `mode=general${date ? `&date=${date}` : ""}`;
      const res = await fetch(`/api/admin/attendance?${qs}`, { credentials: "include" });
      fetch(`/api/admin/attendance/presence?${qs}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((pd) => {
          if (!pd) return;
          if (mode === "general" && dateRef.current && pd.date !== dateRef.current) return;
          setPresence(pd);
        })
        .catch(() => {});
      if (res.ok) {
        const payload = await res.json();
        // a slow reply for a day that is no longer selected must not
        // overwrite the list of the day now on screen
        if (mode === "general" && dateRef.current && payload.date !== dateRef.current) return;
        setData(payload);
        if (mode === "general" && !date && payload.date) setDate(payload.date);
      }
    } catch {
      /* keep last data */
    }
  }, [mode, eventId, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // several admins may scan simultaneously — keep the table fresh
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Track today's date; when the day rolls over while the admin is viewing
  // "today" (page left open overnight), follow it to the new day.
  useEffect(() => {
    const tick = () => {
      const now = riyadhToday();
      const prev = todayRef.current;
      if (now === prev) return;
      todayRef.current = now;
      setToday(now);
      if (prev) setDate((d) => (d === prev ? now : d));
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  const showResult = (r: ScanResult) => {
    // distinct tones: success chirp / duplicate double-blip / error buzz
    playScanSound(
      r.kind === "rejected"
        ? "error"
        : r.kind === "alreadyAttended" || r.kind === "alreadyCheckedIn" || r.kind === "alreadyOut"
          ? "duplicate"
          : "success"
    );
    setResult(r);
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => setResult(null), 4000);
  };

  const submitCode = useCallback(
    async (badgeCode: string, method: "scan" | "manual") => {
      if (scanBusyRef.current) return;
      if (mode === "event" && !eventId) {
        showResult({ kind: "rejected", message: "اختر الفعالية أولاً" });
        return;
      }
      scanBusyRef.current = true;
      try {
        const res = await fetch("/api/admin/attendance/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            badgeCode,
            mode,
            ...(mode === "event" ? { eventId } : {}),
            method,
            direction,
          }),
        });
        const payload = await res.json();

        if (res.ok && payload.success) {
          const kindMap: Record<string, ScanResult["kind"]> = {
            attended: payload.wasAbsent ? "wasAbsent" : "attended",
            alreadyAttended: "alreadyAttended",
            checkedIn: "checkedIn",
            alreadyCheckedIn: "alreadyCheckedIn",
            reEntered: "reEntered",
            checkedOut: "checkedOut",
            alreadyOut: "alreadyOut",
          };
          const kind = kindMap[payload.result] ?? "attended";
          const messages: Record<ScanResult["kind"], string> = {
            attended: "تم تسجيل الحضور ✓",
            wasAbsent: "كان مسجلاً كغائب — تم تحديثه إلى حاضر ✓",
            alreadyAttended: "تم تسجيل حضوره مسبقاً",
            checkedIn: "تم تسجيل الدخول ✓",
            alreadyCheckedIn: payload.scanId ? "سجّل دخوله ✓ (مسجّل حضوره اليوم مسبقاً)" : "مسجّل دخوله بالفعل",
            reEntered: "تم تسجيل العودة (دخول) ✓",
            checkedOut: "تم تسجيل الخروج ✓",
            alreadyOut: "مسجّل خروجه بالفعل",
            rejected: "",
          };
          // general check-ins are saved under the server's today, not the picked day
          const savedDate: string | undefined = mode === "general" ? payload.date : undefined;
          showResult({
            kind,
            message: messages[kind],
            name: payload.fullName,
            teamName: payload.teamName,
            participantId: payload.participantId,
            date: savedDate,
            presenceLine: presenceLine(payload.presence),
          });
          if (payload.scanId) {
            setSessionScans((prev) => [
              {
                participantId: payload.participantId,
                name: payload.fullName,
                time: new Date().toLocaleTimeString("ar-SA"),
                date: savedDate,
                scanId: payload.scanId,
                direction: payload.direction,
                createdCheckin: Boolean(payload.createdCheckin),
              },
              ...prev.slice(0, 19),
            ]);
          }
          if (savedDate && savedDate !== dateRef.current) {
            // jump the list to the day the check-in landed on (the effect refetches)
            setDate(savedDate);
          } else {
            fetchData();
          }
        } else {
          showResult({
            kind: "rejected",
            message: payload.error || "فشل تسجيل الحضور",
            name: payload.fullName,
            teamName: payload.teamName,
          });
        }
      } catch {
        showResult({ kind: "rejected", message: "تعذر الاتصال بالخادم" });
      } finally {
        scanBusyRef.current = false;
      }
    },
    [mode, eventId, fetchData, direction]
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

  const handleUndo = async (scan: SessionScan) => {
    try {
      const res = await fetch("/api/admin/attendance/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          scan.scanId
            ? // exactly this entry/exit; the day's check-in only if this scan created it
              { scanId: scan.scanId, revertCheckin: scan.createdCheckin }
            : {
                participantId: scan.participantId,
                mode,
                // undo the day the check-in was saved under, not the day on screen
                ...(mode === "event" ? { eventId } : { date: scan.date ?? date }),
              }
        ),
      });
      if (!res.ok) throw new Error();
      setSessionScans((prev) =>
        prev.map((s) => (scan.scanId ? s.scanId === scan.scanId : s.participantId === scan.participantId) ? { ...s, undone: true } : s)
      );
      toast({
        title: "تم التراجع",
        description: `أُلغي ${scan.direction === "out" ? "تسجيل خروج" : "تسجيل دخول"} ${scan.name}`,
      });
      fetchData();
    } catch {
      toast({ title: "خطأ", description: "فشل التراجع", variant: "destructive" });
    }
  };

  const tableRows: AttendanceRow[] = useMemo(() => {
    if (!data) return [];
    if (data.mode === "event") return data.rows ?? [];
    return [
      ...(data.checkedIn ?? []).map((r) => ({ ...r, status: "attended" })),
      ...(data.notCheckedIn ?? []).map((r) => ({ ...r, status: "registered" })),
    ];
  }, [data]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tableRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.teamName ?? "").toLowerCase().includes(q)
      );
    });
  }, [tableRows, search, statusFilter]);

  const handleExport = () => {
    const rows = filteredRows.map((r) => ({
      الاسم: r.name,
      "البريد الإلكتروني": r.email,
      الفريق: r.teamName || "بدون فريق",
      الحالة: STATUS_LABELS[r.status ?? ""] ?? r.status ?? "-",
      "وقت التسجيل": r.scannedAt
        ? new Date(r.scannedAt).toLocaleString("ar-SA")
        : (r as any).time
          ? new Date((r as any).time).toLocaleString("ar-SA")
          : "-",
      الطريقة: r.method === "scan" ? "مسح" : r.method === "manual" ? "يدوي" : "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحضور");
    const label =
      mode === "event"
        ? events.find((e) => e.id === eventId)?.title || "فعالية"
        : `حضور_عام_${date}`;
    XLSX.writeFile(wb, `الحضور_${label}.xlsx`);
  };

  const resultStyles: Record<ScanResult["kind"], string> = {
    attended: "bg-green-50 border-green-500 text-green-800",
    checkedIn: "bg-green-50 border-green-500 text-green-800",
    wasAbsent: "bg-blue-50 border-blue-500 text-blue-800",
    alreadyAttended: "bg-yellow-50 border-yellow-500 text-yellow-800",
    alreadyCheckedIn: "bg-yellow-50 border-yellow-500 text-yellow-800",
    reEntered: "bg-green-50 border-green-500 text-green-800",
    checkedOut: "bg-blue-50 border-blue-500 text-blue-800",
    alreadyOut: "bg-yellow-50 border-yellow-500 text-yellow-800",
    rejected: "bg-red-50 border-red-500 text-red-800",
  };

  const exportPresence = () => {
    if (!presence) return;
    const rows = presence.rows.map((r) => ({
      الاسم: r.name,
      الفريق: r.teamName || "بدون فريق",
      الحالة: r.summary.state === "inside" ? "داخل الآن" : r.summary.state === "outside" ? "خارج" : "-",
      "أول دخول": formatTime(r.summary.firstIn),
      "آخر خروج": formatTime(r.summary.lastOut),
      "مدة التواجد (دقيقة)": r.summary.insideMinutes,
      "وقت الخروج بين الدخولات (دقيقة)": r.summary.outsideMinutes,
      "مرات الخروج": r.summary.exits,
      ...(presence.mode === "event"
        ? {
            "تأخر (دقيقة)": r.summary.lateMinutes ?? "-",
            "خرج مبكراً (دقيقة)": r.summary.leftEarlyMinutes ?? "-",
            "فاته من الفعالية (دقيقة)": r.summary.missedMinutes ?? "-",
          }
        : {}),
      "لم يسجل خروج": r.summary.missingCheckout ? "نعم" : "",
      "السجل": r.scans.map((x) => `${x.direction === "in" ? "دخول" : "خروج"} ${formatTime(x.at)}`).join(" | "),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الدخول والخروج");
    const label = mode === "event" ? events.find((e) => e.id === eventId)?.title || "فعالية" : `عام_${presence.date}`;
    XLSX.writeFile(wb, `الدخول_والخروج_${label}.xlsx`);
  };

  const countCards =
    data?.mode === "event"
      ? [
          { label: "المسجلون", value: data.counts.registered },
          { label: "الحضور", value: data.counts.attended },
          { label: "لم يحضر بعد", value: data.counts.remaining },
          { label: "غائب", value: data.counts.absent },
        ]
      : data
        ? [
            { label: "إجمالي المشاركين", value: data.counts.total },
            { label: "سجّلوا الدخول", value: data.counts.checkedIn },
            { label: "لم يسجلوا", value: data.counts.notCheckedIn },
          ]
        : [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">تسجيل الحضور</h1>

      {/* mode + target picker */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === "event" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode("event");
                setResult(null);
              }}
            >
              حضور فعالية
            </Button>
            <Button
              variant={mode === "general" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode("general");
                setResult(null);
              }}
            >
              تسجيل حضور عام
            </Button>
          </div>

          {mode === "event" ? (
            <div className="grid gap-2 md:max-w-md">
              <Label>الفعالية</Label>
              <Select value={eventId} onValueChange={setEventId} dir="rtl">
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفعالية..." />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} — {new Date(e.startDate).toLocaleDateString("ar-SA")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-2 md:max-w-xs">
                <Label>اليوم</Label>
                <Input
                  type="date"
                  dir="ltr"
                  value={date}
                  max={today || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && today && v > today) return; // no future days
                    setDate(v);
                  }}
                />
              </div>
              {today && (
                <p className="text-xs text-muted-foreground">
                  المسح يُسجَّل دائماً بتاريخ اليوم (<span dir="ltr">{today}</span>). هذا الحقل لعرض القوائم فقط.
                </p>
              )}
              {today && date && date !== today && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-800 md:max-w-xl">
                  <span>
                    تعرض قائمة <span dir="ltr">{date}</span> — أي مسح الآن يُسجَّل بتاريخ اليوم{" "}
                    <span dir="ltr">{today}</span>
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDate(today)}>
                    العودة إلى اليوم
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            مسح البطاقات
          </CardTitle>
          <CardDescription>
            امسح رمز QR من بطاقة المشارك (رقمية أو مطبوعة)، أو أدخل رمز البطاقة يدوياً.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">نوع المسح:</span>
            {([
              ["auto", "تلقائي (دخول/خروج)"],
              ["in", "دخول"],
              ["out", "خروج"],
            ] as const).map(([v, label]) => (
              <Button key={v} size="sm" variant={direction === v ? "default" : "outline"} onClick={() => setDirection(v)}>
                {label}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground">«تلقائي»: داخل المكان ← خروج، وإلا ← دخول. يمكن الدخول والخروج أكثر من مرة.</span>
          </div>
          {result && (
            <div className={`border-r-4 rounded-md p-4 ${resultStyles[result.kind]}`}>
              <div className="font-bold text-lg">{result.message}</div>
              {result.name && (
                <div className="text-sm mt-1">
                  {result.name}
                  {result.teamName ? ` — فريق ${result.teamName}` : ""}
                </div>
              )}
              {result.date && (
                <div className="text-sm mt-1">
                  بتاريخ <span dir="ltr">{result.date}</span>
                </div>
              )}
              {result.presenceLine && <div className="text-sm mt-1">{result.presenceLine}</div>}
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
            <div className="text-center">
              <Button onClick={() => { unlockScanAudio(); setCameraOn(true); }} className="bg-blue-600 hover:bg-blue-700">
                <Camera className="ml-2 h-4 w-4" />
                تشغيل الكاميرا للمسح
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleSound}
                className="mr-2"
                title={soundMuted ? "تشغيل صوت المسح" : "كتم صوت المسح"}
                aria-pressed={!soundMuted}
              >
                {soundMuted ? <VolumeX className="ml-1 h-4 w-4" /> : <Volume2 className="ml-1 h-4 w-4" />}
                {soundMuted ? "الصوت مكتوم" : "صوت المسح"}
              </Button>
            </div>
          )}

          <form onSubmit={handleManual} className="flex flex-col md:flex-row gap-2 md:max-w-md md:mx-auto">
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

          {sessionScans.length > 0 && (
            <div className="border rounded-md p-3">
              <h4 className="text-sm font-semibold mb-2">آخر عمليات المسح (هذه الجلسة)</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {sessionScans.map((s, i) => (
                  <div key={`${s.participantId}-${i}`} className="flex items-center justify-between text-sm">
                    <span className={s.undone ? "line-through text-muted-foreground" : ""}>
                      {s.direction && (
                        <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${s.direction === "in" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                          {s.direction === "in" ? "دخول" : "خروج"}
                        </span>
                      )}
                      {s.name} <span className="text-muted-foreground text-xs">({s.time})</span>
                    </span>
                    {!s.undone && (
                      <button
                        type="button"
                        onClick={() => handleUndo(s)}
                        className="text-xs text-red-500 hover:underline flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        تراجع
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* stats + table */}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {countCards.map((c) => (
              <Card key={c.label}>
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold">{c.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {presence && (
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle className="text-lg">
                    الدخول والخروج — {presence.mode === "event" ? data.event?.title ?? "" : presence.date}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={exportPresence} disabled={presence.rows.length === 0}>
                    <Download className="ml-2 h-4 w-4" />
                    تصدير Excel
                  </Button>
                </div>
                <CardDescription>
                  {presence.counts.people} شخص · داخل الآن {presence.counts.insideNow} · {presence.counts.exits} عملية خروج.
                  اضغط على صف لعرض سجل الدخول والخروج.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {presence.rows.length === 0 ? (
                  <p className="text-center p-4 text-muted-foreground">لا توجد عمليات دخول أو خروج مسجلة لهذا الاختيار.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border p-2 text-right">الاسم</th>
                          <th className="border p-2 text-right">الحالة</th>
                          <th className="border p-2 text-right">أول دخول</th>
                          <th className="border p-2 text-right">آخر خروج</th>
                          <th className="border p-2 text-right">مدة التواجد</th>
                          <th className="border p-2 text-right">وقت الخروج</th>
                          <th className="border p-2 text-right">مرات الخروج</th>
                          {presence.mode === "event" && <th className="border p-2 text-right">تأخر</th>}
                          {presence.mode === "event" && <th className="border p-2 text-right">خرج مبكراً</th>}
                          {presence.mode === "event" && <th className="border p-2 text-right">فاته</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {presence.rows.map((r) => (
                          <Fragment key={r.participantId}>
                            <tr
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpanded(expanded === r.participantId ? null : r.participantId)}
                            >
                              <td className="border p-2">
                                <div className="font-medium">{r.name}</div>
                                <div className="text-xs text-muted-foreground">{r.teamName || "بدون فريق"}</div>
                              </td>
                              <td className="border p-2">
                                {r.summary.state === "inside" ? (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">داخل الآن</span>
                                ) : (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">خارج</span>
                                )}
                                {r.summary.missingCheckout && (
                                  <div className="mt-1 text-xs text-yellow-700">لم يُسجَّل خروجه</div>
                                )}
                              </td>
                              <td className="border p-2" dir="ltr">{formatTime(r.summary.firstIn)}</td>
                              <td className="border p-2" dir="ltr">{formatTime(r.summary.lastOut)}</td>
                              <td className="border p-2 font-semibold">{formatMinutes(r.summary.insideMinutes)}</td>
                              <td className="border p-2">{formatMinutes(r.summary.outsideMinutes)}</td>
                              <td className="border p-2">{r.summary.exits}</td>
                              {presence.mode === "event" && <td className="border p-2">{formatMinutes(r.summary.lateMinutes)}</td>}
                              {presence.mode === "event" && <td className="border p-2">{formatMinutes(r.summary.leftEarlyMinutes)}</td>}
                              {presence.mode === "event" && <td className="border p-2">{formatMinutes(r.summary.missedMinutes)}</td>}
                            </tr>
                            {expanded === r.participantId && (
                              <tr>
                                <td className="border bg-muted/30 p-2" colSpan={presence.mode === "event" ? 10 : 7}>
                                  <div className="flex flex-wrap gap-1">
                                    {r.scans.map((x) => (
                                      <span
                                        key={x.id}
                                        className={`rounded px-1.5 py-0.5 text-xs ${x.direction === "in" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
                                      >
                                        {x.direction === "in" ? "دخول" : "خروج"} {formatTime(x.at)}
                                        {x.by === "organizer" ? " (منظم)" : ""}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="text-lg">
                  {data.mode === "event"
                    ? `قائمة الحضور — ${data.event?.title ?? ""}`
                    : `الحضور العام — ${data.date}`}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredRows.length === 0}>
                  <Download className="ml-2 h-4 w-4" />
                  تصدير Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pr-10"
                    placeholder="ابحث بالاسم أو البريد أو الفريق..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter} dir="rtl">
                  <SelectTrigger className="md:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="attended">حاضر</SelectItem>
                    <SelectItem value="registered">{data.mode === "event" ? "مسجل (لم يحضر)" : "لم يسجل الدخول"}</SelectItem>
                    {data.mode === "event" && <SelectItem value="absent">غائب</SelectItem>}
                    {data.mode === "event" && <SelectItem value="cancelled">ملغى</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              {filteredRows.length === 0 ? (
                <p className="text-center p-4 text-muted-foreground">
                  {data.mode === "event" && !eventId ? "اختر فعالية لعرض قائمتها." : "لا توجد نتائج."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 text-right">الاسم</th>
                        <th className="border p-2 text-right">الفريق</th>
                        <th className="border p-2 text-right">الحالة</th>
                        <th className="border p-2 text-right">وقت التسجيل</th>
                        <th className="border p-2 text-right">الطريقة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.participantId} className="hover:bg-muted/50">
                          <td className="border p-2">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {r.email}
                            </div>
                          </td>
                          <td className="border p-2 text-sm">{r.teamName || "بدون فريق"}</td>
                          <td className="border p-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${STATUS_PILL[r.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                              {STATUS_LABELS[r.status ?? ""] ?? r.status}
                            </span>
                          </td>
                          <td className="border p-2 text-sm">
                            {r.scannedAt
                              ? new Date(r.scannedAt).toLocaleString("ar-SA")
                              : (r as any).time
                                ? new Date((r as any).time).toLocaleString("ar-SA")
                                : "-"}
                          </td>
                          <td className="border p-2 text-sm">
                            {r.method === "scan" ? "مسح" : r.method === "manual" ? "يدوي" : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 text-sm text-muted-foreground text-center">
                إجمالي الصفوف: {filteredRows.length}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
