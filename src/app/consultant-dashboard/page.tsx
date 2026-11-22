"use client";

/**
 * Consultant board (تقييم المستشارين): the teams of the rating phase as cards.
 * One click opens the full team file next to the criteria list; the
 * consultant picks 1..5 per criterion, sees the computed total (0..100) and
 * saves. Ratings can be changed at any time while the admin keeps rating
 * open. Each card also shows the team's combined average from all
 * consultants. API: /api/consultant/teams, /api/consultant/teams/:id.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  LogOut, Search, Users, CheckCircle2, Loader2, FileText, ExternalLink, Lock, Save, Star, ClipboardCheck, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_TIME_ZONE } from "@/lib/riyadh-time";

interface Criterion { key: string; title: string; description: string; weight: number }
interface MyRating { scores: Record<string, number>; total: number; notes: string | null; updatedAt: string }
interface Aggregate { count: number; avgTotal: number; criterionAvg?: Record<string, number>; criterionAvgScore?: Record<string, number> }
interface TeamRow {
  id: string; teamName: string; leaderName: string; hackathonTrack: string | null; ideaName: string | null;
  ideaDescription: string; membersCount: number; myRating: MyRating | null; aggregate: Aggregate;
}
interface Payload {
  consultant: { id: string; name: string; username: string };
  settings: { enabled: boolean; phaseId: string | null; phaseName: string | null; finalWeight: number };
  criteria: Criterion[];
  teams: TeamRow[];
}
interface Member {
  id: string; name: string; isLeader: boolean; gender: string | null; city: string | null; university: string | null;
  major: string | null; education: string | null; isUniversityStudent: boolean | null; professionalField: string | null; employmentStatus: string | null;
}
interface Submission { id: string; milestoneTitle: string; fileName: string; filePath: string; submittedAt: string; reviewStatus: string | null; submittedBy: string }
interface TeamDetail {
  id: string; teamName: string; hackathonTrack: string | null; phaseName: string | null; ideaName: string | null; ideaDescription: string | null;
  challenge: string | null; challengeReason: string | null; ideaSolution: string | null; ideaResults: string | null; ideaStage: string | null;
  hasParticipated: boolean | null; participationDetails: string | null; attachmentPath: string | null; createdAt: string;
  members: Member[]; submissions: Submission[];
}
interface DetailPayload { team: TeamDetail; myRating: MyRating | null; aggregate: Aggregate; criteria: Criterion[]; settings: { enabled: boolean; finalWeight: number } }

const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: APP_TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const fmtDate = (v: string | null | undefined) => (v ? fmt.format(new Date(v)) : "—");
const SCALE = [1, 2, 3, 4, 5];
const SCALE_LABEL: Record<number, string> = { 1: "ضعيف", 2: "مقبول", 3: "جيد", 4: "جيد جداً", 5: "ممتاز" };

function totalOf(scores: Record<string, number>, criteria: Criterion[]): number {
  return Math.round(criteria.reduce((s, c) => s + ((scores[c.key] || 0) / 5) * c.weight, 0) * 100) / 100;
}
function scoreColor(total: number) {
  if (total >= 80) return "text-green-700 bg-green-50 border-green-200";
  if (total >= 60) return "text-[#2F44DC] bg-blue-50 border-blue-200";
  if (total >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

export default function ConsultantDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("");
  const [onlyUnrated, setOnlyUnrated] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const goToLogin = useCallback(() => router.replace("/consultant-login"), [router]);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/consultant/teams", { credentials: "include", cache: "no-store" });
      if (res.status === 401) return goToLogin();
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحميل الفرق");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الفرق");
    } finally {
      setLoading(false);
    }
  }, [goToLogin]);

  useEffect(() => { load(); }, [load]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {});
    goToLogin();
  };

  const tracks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of data?.teams || []) if (t.hackathonTrack) m[t.hackathonTrack] = (m[t.hackathonTrack] || 0) + 1;
    return Object.keys(m).sort().map((name) => ({ name, count: m[name] }));
  }, [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.teams || []).filter((t) =>
      (!track || t.hackathonTrack === track) &&
      (!onlyUnrated || !t.myRating) &&
      (!s || t.teamName.toLowerCase().includes(s) || t.leaderName.toLowerCase().includes(s) || (t.ideaName || "").toLowerCase().includes(s))
    );
  }, [data, q, track, onlyUnrated]);

  const ratedCount = (data?.teams || []).filter((t) => t.myRating).length;
  const totalCount = data?.teams.length || 0;

  /** merge a saved rating back into the list without a full reload */
  const onSaved = (teamId: string, myRating: MyRating | null, aggregate: Aggregate | null) => {
    setData((d) => d ? { ...d, teams: d.teams.map((t) => t.id === teamId ? { ...t, myRating: myRating ?? t.myRating, aggregate: aggregate ? { count: aggregate.count, avgTotal: aggregate.avgTotal } : t.aggregate } : t) } : d);
  };

  if (loading && !data) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#2F44DC]" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/logo2.png" alt="مياهثون" width={120} height={40} className="h-9 w-auto" />
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold text-[#001742]"><ClipboardCheck className="h-5 w-5 text-[#2F44DC]" /> تقييم المستشارين</h1>
              {data && !data.settings.phaseId && <p className="text-xs text-slate-500">لم يتم تحديد مرحلة التقييم بعد</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left text-sm">
              <p className="font-semibold text-[#001742]">{data?.consultant.name}</p>
              <p className="text-xs text-slate-500" dir="ltr">{data?.consultant.username}</p>
            </div>
            <Button variant="outline" size="sm" onClick={logout}><LogOut className="ml-2 h-4 w-4" /> خروج</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-4 w-4" /> {error}</div>}

        {data && !data.settings.enabled && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Lock className="h-4 w-4 shrink-0" /> التقييم مغلق حالياً من قبل الإدارة. يمكنك الاطلاع على الفرق وتقييماتك السابقة دون تعديل.
          </div>
        )}

        {/* ------------------------------------------------------------ progress */}
        <section>
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[#001742]">تقدّمك في التقييم</span>
              <span className="tabular-nums text-slate-600">{ratedCount} / {totalCount} فريقاً</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#2F44DC,#53AEF5)] transition-all" style={{ width: `${totalCount ? (ratedCount / totalCount) * 100 : 0}%` }} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ filters */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute right-[14px] top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الفريق أو قائد الفريق أو الفكرة…" className="h-11 rounded-xl bg-white pr-[44px] pl-[16px]" />
            </div>
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 text-sm">
              <input type="checkbox" checked={onlyUnrated} onChange={(e) => setOnlyUnrated(e.target.checked)} className="h-4 w-4 accent-[#2F44DC]" />
              الفرق التي لم أقيّمها بعد ({totalCount - ratedCount})
            </label>
          </div>
          {tracks.length > 1 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <button type="button" onClick={() => setTrack("")} className={`flex h-10 items-center justify-between gap-2 rounded-xl border px-3 text-xs font-medium transition ${!track ? "border-[#2F44DC] bg-[#2F44DC] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#2F44DC]/40"}`}>
                <span className="truncate">كل المسارات</span><span className={`rounded-full px-1.5 text-[11px] ${!track ? "bg-white/20" : "bg-slate-100"}`}>{totalCount}</span>
              </button>
              {tracks.map((t) => (
                <button key={t.name} type="button" onClick={() => setTrack(track === t.name ? "" : t.name)} className={`flex h-10 items-center justify-between gap-2 rounded-xl border px-3 text-xs font-medium transition ${track === t.name ? "border-[#2F44DC] bg-[#2F44DC] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#2F44DC]/40"}`}>
                  <span className="truncate">{t.name}</span><span className={`rounded-full px-1.5 text-[11px] ${track === t.name ? "bg-white/20" : "bg-slate-100"}`}>{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ cards */}
        {totalCount === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-500">لا توجد فرق في مرحلة التقييم حالياً.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((team) => (
              <article
                key={team.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(team.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(team.id); } }}
                className={`group relative flex min-h-[210px] cursor-pointer flex-col rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${team.myRating ? "border-green-200" : "border-slate-200"}`}
              >
                <div className="mb-6 flex items-start justify-between gap-2">
                  {team.hackathonTrack ? (
                    <span className="inline-flex h-6 min-w-0 max-w-full items-center rounded-full border border-[#2F44DC]/20 bg-[#2F44DC]/10 px-2.5 text-[11px] font-medium text-[#2F44DC]">
                      <span className="truncate leading-6">{team.hackathonTrack}</span>
                    </span>
                  ) : <span />}
                  {team.myRating ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white"><CheckCircle2 className="h-3 w-3" /> تم التقييم</span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">بانتظار التقييم</span>
                  )}
                </div>
                <h3 className="line-clamp-3 text-xl font-bold leading-snug text-[#001742]">{team.teamName}</h3>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-6 text-center text-xs">
                  <div className={`rounded-xl border px-2 py-1.5 ${team.myRating ? scoreColor(team.myRating.total) : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    <div className="text-[10px]">تقييمك</div>
                    <div className="text-base font-bold tabular-nums">{team.myRating ? `${team.myRating.total}` : "—"}<span className="text-[10px] font-normal"> /100</span></div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700">
                    <div className="text-[10px]">متوسط المستشارين ({team.aggregate.count})</div>
                    <div className="text-base font-bold tabular-nums">{team.aggregate.count ? team.aggregate.avgTotal : "—"}<span className="text-[10px] font-normal"> /100</span></div>
                  </div>
                </div>
              </article>
            ))}
            {filtered.length === 0 && <div className="col-span-full rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">لا توجد نتائج مطابقة.</div>}
          </div>
        )}
      </main>

      {openId && data && (
        <TeamDialog teamId={openId} criteria={data.criteria} enabled={data.settings.enabled} onClose={() => setOpenId(null)} onSaved={onSaved} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-800">{value}</dd>
    </div>
  );
}

function TeamDialog({ teamId, criteria, enabled, onClose, onSaved }: {
  teamId: string; criteria: Criterion[]; enabled: boolean; onClose: () => void;
  onSaved: (teamId: string, myRating: MyRating | null, aggregate: Aggregate | null) => void;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetch(`/api/consultant/teams/${teamId}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "تعذر تحميل بيانات الفريق");
        if (cancelled) return;
        setDetail(json);
        setScores(json.myRating?.scores || {});
        setNotes(json.myRating?.notes || "");
        setDirty(false);
        setSaved(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الفريق"));
    return () => { cancelled = true; };
  }, [teamId]);

  const complete = criteria.every((c) => scores[c.key] >= 1 && scores[c.key] <= 5);
  const total = totalOf(scores, criteria);

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/consultant/teams/${teamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scores, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر حفظ التقييم");
      setDetail((d) => d ? { ...d, myRating: json.myRating, aggregate: json.aggregate ?? d.aggregate } : d);
      onSaved(teamId, json.myRating, json.aggregate);
      setDirty(false);
      setSaved(`تم حفظ التقييم (${json.total} / 100)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ التقييم");
    } finally {
      setSaving(false);
    }
  };

  const team = detail?.team;
  const agg = detail?.aggregate;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="!p-0 max-h-[92vh] w-[96vw] max-w-6xl overflow-hidden sm:rounded-2xl">
        {/* 92vh minus the dialog border — the Dialog base class p-6 is forced off above */}
        <div className="flex max-h-[calc(92vh-2px)] min-w-0 flex-col">
          <DialogHeader className="border-b bg-white px-6 py-4 text-right">
            <DialogTitle className="text-xl text-[#001742]">{team?.teamName || "…"}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {team?.hackathonTrack && <span className="rounded-full border border-[#2F44DC]/20 bg-[#2F44DC]/10 px-2 py-0.5 text-[#2F44DC]">{team.hackathonTrack}</span>}
              {team && <span>{team.members.length} أعضاء</span>}
            </DialogDescription>
          </DialogHeader>

          {!detail && !error && <div className="flex flex-1 items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-[#2F44DC]" /></div>}
          {error && !detail && <div className="m-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-4 w-4" /> {error}</div>}

          {team && (
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
              {/* lg: one grid row sized to the remaining dialog height (minmax(0,1fr)), so each
                  column gets a definite height and scrolls on its own all the way to its end */}
              {/* ------------------------------------------------ team file */}
              <div className="min-w-0 space-y-6 p-6 lg:col-span-3 lg:overflow-y-auto">
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-[#001742]"><FileText className="h-4 w-4 text-[#2F44DC]" /> الفكرة</h3>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم الفكرة" value={team.ideaName} />
                    <Field label="مرحلة الفكرة" value={team.ideaStage} />
                    <Field label="التحدي" value={team.challenge} wide />
                    <Field label="سبب اختيار التحدي" value={team.challengeReason} wide />
                    <Field label="وصف الفكرة" value={team.ideaDescription} wide />
                    <Field label="الحل المقترح" value={team.ideaSolution} wide />
                    <Field label="النتائج المتوقعة" value={team.ideaResults} wide />
                    {team.hasParticipated !== null && <Field label="هل شاركت الفكرة من قبل؟" value={team.hasParticipated ? `نعم${team.participationDetails ? ` — ${team.participationDetails}` : ""}` : "لا"} wide />}
                    {team.attachmentPath && (
                      <Field label="مرفق الفريق" value={<a href={team.attachmentPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#2F44DC] hover:underline"><ExternalLink className="h-3.5 w-3.5" /> فتح المرفق</a>} />
                    )}
                  </dl>
                </section>

                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-[#001742]"><Users className="h-4 w-4 text-[#2F44DC]" /> أعضاء الفريق ({team.members.length})</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {team.members.map((m) => (
                      <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.isLeader ? "border-[#2F44DC]/30 bg-[#2F44DC]/5" : "border-slate-200"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#001742]">{m.name || "—"}</span>
                          {m.isLeader && <span className="rounded-full bg-[#2F44DC] px-2 py-0.5 text-[10px] font-semibold text-white">قائد الفريق</span>}
                        </div>
                        <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-slate-600">
                          {m.professionalField && <div><span className="text-slate-400">المجال المهني: </span>{m.professionalField}</div>}
                          {m.employmentStatus && <div><span className="text-slate-400">الحالة الوظيفية: </span>{m.employmentStatus}</div>}
                          {(m.university || m.isUniversityStudent !== null) && <div><span className="text-slate-400">الجامعة: </span>{m.university || (m.isUniversityStudent ? "طالب جامعي" : "غير طالب")}</div>}
                          {m.major && <div><span className="text-slate-400">التخصص: </span>{m.major}</div>}
                          {m.education && <div><span className="text-slate-400">المؤهل: </span>{m.education}</div>}
                          {m.city && <div><span className="text-slate-400">المدينة: </span>{m.city}</div>}
                          {m.gender && <div><span className="text-slate-400">الجنس: </span>{m.gender}</div>}
                        </dl>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-[#001742]"><FileText className="h-4 w-4 text-[#2F44DC]" /> تسليمات الفريق ({team.submissions.length})</h3>
                  {team.submissions.length === 0 ? (
                    <p className="text-sm text-slate-500">لا توجد تسليمات.</p>
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {team.submissions.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-medium text-[#001742]">{s.milestoneTitle}</p>
                            <p className="break-words text-xs text-slate-500">{s.fileName} · {s.submittedBy} · {fmtDate(s.submittedAt)}</p>
                          </div>
                          <a href={s.filePath} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-[#2F44DC] hover:bg-[#2F44DC]/5"><ExternalLink className="h-3.5 w-3.5" /> فتح الملف</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* ------------------------------------------------ rating panel */}
              <aside className="min-w-0 border-t bg-slate-50 p-5 lg:col-span-2 lg:overflow-y-auto lg:border-r lg:border-t-0">
                <h3 className="flex items-center gap-2 text-base font-bold text-[#001742]"><Star className="h-4 w-4 text-[#2F44DC]" /> معايير التقييم</h3>
                <p className="mt-1 text-xs text-slate-500">اختر تقديراً من 1 إلى 5 لكل معيار. درجة المعيار = (التقدير ÷ 5) × الوزن.</p>

                <div className="mt-4 space-y-4">
                  {criteria.map((c, i) => {
                    const v = scores[c.key];
                    const got = v ? Math.round((v / 5) * c.weight * 100) / 100 : 0;
                    return (
                      <div key={c.key} className="rounded-xl border bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#001742]">{i + 1}. {c.title}</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{c.description}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">الوزن {c.weight}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="grid flex-1 grid-cols-5 gap-1.5" role="radiogroup" aria-label={c.title}>
                            {SCALE.map((n) => (
                              <button
                                key={n}
                                type="button"
                                role="radio"
                                aria-checked={v === n}
                                title={SCALE_LABEL[n]}
                                disabled={!enabled}
                                onClick={() => { setScores((s) => ({ ...s, [c.key]: n })); setDirty(true); setSaved(null); }}
                                className={`h-10 rounded-lg border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${v === n ? "border-[#2F44DC] bg-[#2F44DC] text-white shadow" : "border-slate-200 bg-white text-slate-700 hover:border-[#2F44DC]/50"}`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          <div className="w-16 shrink-0 text-center text-xs tabular-nums text-slate-600">
                            <div className="text-base font-bold text-[#2F44DC]">{v ? got : "—"}</div>
                            <div className="text-[10px]">من {c.weight}</div>
                          </div>
                        </div>
                        {v && <p className="mt-1 text-[11px] text-slate-500">{SCALE_LABEL[v]}</p>}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border bg-white p-3">
                  <label className="text-xs font-semibold text-[#001742]" htmlFor="rating-notes">ملاحظات (اختياري)</label>
                  <Textarea id="rating-notes" value={notes} disabled={!enabled} onChange={(e) => { setNotes(e.target.value); setDirty(true); setSaved(null); }} rows={3} maxLength={2000} placeholder="ملاحظاتك على الفريق أو فكرته…" className="mt-1 text-sm" />
                </div>

                <div className={`mt-4 rounded-2xl border-2 p-4 ${complete ? scoreColor(total) : "border-slate-200 bg-white text-slate-600"}`}>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs">مجموع تقييمك</p>
                      <p className="text-3xl font-black tabular-nums">{complete ? total : "—"}<span className="text-sm font-semibold"> / 100</span></p>
                    </div>
                    {!complete && <p className="text-xs">أكمل تقدير {criteria.filter((c) => !scores[c.key]).length} معايير</p>}
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10">
                    <div className="h-full rounded-full bg-current transition-all" style={{ width: `${complete ? total : 0}%` }} />
                  </div>
                </div>

                {error && detail && <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"><AlertCircle className="h-4 w-4" /> {error}</div>}
                {saved && !dirty && <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-2.5 text-xs text-green-800"><CheckCircle2 className="h-4 w-4" /> {saved}</div>}

                <div className="mt-3 flex items-center gap-2">
                  <Button className="flex-1 gap-2 bg-[#2F44DC] hover:bg-[#2538b8]" disabled={!enabled || !complete || saving || !dirty} onClick={save}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {detail?.myRating ? "حفظ التعديل" : "حفظ التقييم"}
                  </Button>
                  <Button variant="outline" onClick={onClose}>إغلاق</Button>
                </div>
                {detail?.myRating && <p className="mt-2 text-[11px] text-slate-500">آخر حفظ: {fmtDate(detail.myRating.updatedAt)}</p>}
                {!enabled && <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700"><Lock className="h-3 w-3" /> التقييم مغلق حالياً.</p>}

                {/* -------------------------------------------- all consultants */}
                <div className="mt-5 rounded-xl border bg-white p-3">
                  <p className="text-xs font-semibold text-[#001742]">إجمالي الفريق من جميع المستشارين</p>
                  {agg && agg.count > 0 ? (
                    <>
                      <p className="mt-1 text-2xl font-black tabular-nums text-[#001742]">{agg.avgTotal}<span className="text-xs font-semibold text-slate-500"> / 100 · متوسط {agg.count} {agg.count === 1 ? "مستشار" : "مستشارين"}</span></p>
                      {agg.criterionAvg && (
                        <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                          {criteria.map((c) => (
                            <li key={c.key} className="flex items-center justify-between gap-2">
                              <span className="truncate">{c.title}</span>
                              <span className="shrink-0 tabular-nums">{agg.criterionAvg![c.key]} / 5 → <b>{agg.criterionAvgScore?.[c.key]}</b> / {c.weight}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">لم يقيّم أي مستشار هذا الفريق بعد.</p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
