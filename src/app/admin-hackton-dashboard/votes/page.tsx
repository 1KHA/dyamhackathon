"use client";

/**
 * Admin — تصويت الجمهور: results with the 5% score, the voters list and the
 * voting settings (phase, window, enable switch). Read API: /api/admin/votes.
 *
 * Score rule (new_req/طريقة حساب 5% للتصويت.png):
 *   درجة التصويت = (أصوات الفريق ÷ أعلى عدد أصوات) × 5
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Vote, Users, Trophy, Clock, RefreshCw, Save, Loader2, Download, Copy, ExternalLink, Search, AlertTriangle, Lock, Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "../../../../components/ui/use-toast";
import { fromRiyadhInput, toRiyadhInput, APP_TIME_ZONE } from "@/lib/riyadh-time";

interface Settings {
  enabled: boolean;
  phaseId: string | null;
  votingStart: string | null;
  votingEnd: string | null;
  maxScore: number;
  updatedAt: string;
}
interface Phase { id: string; name: string; order: number; isDisabled: boolean }
interface Result {
  teamId: string; teamName: string; leaderName: string; hackathonTrack: string | null; onBallot: boolean;
  votes: number; percentOfTotal: number; score: number; rank: number;
}
interface Summary { totalVotes: number; topVotes: number; voters: number; teamsOnBallot: number; teamsWithVotes: number; lastVoteAt: string | null }
type State = { open: true; endsAt: string | null } | { open: false; reason: string; message: string };
interface Payload { settings: Settings; state: State; serverTime: string; phases: Phase[]; summary: Summary; results: Result[] }
interface VoterRow { id: string; votedAt: string; teamId: string; teamName: string; email: string; firstName: string; lastName: string }

const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: APP_TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const fmtDate = (v: string | null) => (v ? fmt.format(new Date(v)) : "—");

export default function VotesAdminPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/admin/votes", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحميل بيانات التصويت");
      setData(json);
      setRefreshedAt(new Date());
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر تحميل بيانات التصويت", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  // live-ish: refresh the numbers every 30s while the page is open
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/vote` : "/vote";

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!data) return <p className="p-6 text-center text-red-500">تعذر تحميل البيانات</p>;

  const { settings, state, summary, results, phases } = data;
  const phaseName = phases.find((p) => p.id === settings.phaseId)?.name || "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Vote className="h-8 w-8 text-[#2F44DC]" /> تصويت الجمهور</h1>
          <p className="mt-1 text-sm text-muted-foreground">المرحلة: {phaseName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge state={state} enabled={settings.enabled} />
          <Button variant="outline" size="sm" onClick={() => load(true)}>
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/vote" target="_blank" rel="noreferrer"><ExternalLink className="ml-2 h-4 w-4" /> صفحة التصويت</a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(publicUrl).then(() => toast({ title: "تم النسخ", description: publicUrl }))}
          >
            <Copy className="ml-2 h-4 w-4" /> نسخ الرابط
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------------------- tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile icon={Vote} label="إجمالي الأصوات" value={summary.totalVotes} />
        <Tile icon={Users} label="المصوّتون (بريد موثّق)" value={summary.voters} />
        <Tile icon={Trophy} label="أعلى عدد أصوات" value={summary.topVotes} sub={results[0]?.votes ? results[0].teamName : undefined} />
        <Tile icon={Users} label="فرق حصلت على أصوات" value={`${summary.teamsWithVotes} / ${summary.teamsOnBallot}`} />
        <Tile icon={Clock} label="آخر صوت" value={summary.lastVoteAt ? fmtDate(summary.lastVoteAt) : "—"} small sub={settings.votingEnd ? `يغلق: ${fmtDate(settings.votingEnd)}` : undefined} />
      </div>

      <Tabs defaultValue="results" dir="rtl">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="results">النتائج والنسب</TabsTrigger>
          <TabsTrigger value="voters">المصوّتون</TabsTrigger>
          <TabsTrigger value="settings">إعدادات التصويت</TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <ResultsTab results={results} summary={summary} maxScore={settings.maxScore} phaseName={phaseName} refreshedAt={refreshedAt} />
        </TabsContent>
        <TabsContent value="voters">
          <VotersTab results={results} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab settings={settings} phases={phases} state={state} onSaved={() => load(true)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusBadge({ state, enabled }: { state: State; enabled: boolean }) {
  if (state.open) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><Unlock className="ml-1 h-3 w-3" /> التصويت مفتوح</Badge>;
  if (!enabled) return <Badge className="bg-gray-200 text-gray-800 hover:bg-gray-200"><Lock className="ml-1 h-3 w-3" /> غير مفعّل</Badge>;
  return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><Lock className="ml-1 h-3 w-3" /> {state.message}</Badge>;
}

function Tile({ icon: Icon, label, value, sub, small }: { icon: typeof Vote; label: string; value: number | string; sub?: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-[#2F44DC]" />
        </div>
        <p className={`mt-1 font-bold ${small ? "text-sm" : "text-2xl"}`}>{typeof value === "number" ? value.toLocaleString("en-US") : value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={sub}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ResultsTab({ results, summary, maxScore, phaseName, refreshedAt }: { results: Result[]; summary: Summary; maxScore: number; phaseName: string; refreshedAt: Date | null }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? results.filter((r) => r.teamName.toLowerCase().includes(s) || r.leaderName.toLowerCase().includes(s)) : results;
  }, [results, q]);

  const exportXlsx = () => {
    const sheet = XLSX.utils.json_to_sheet(
      results.map((r) => ({
        "الترتيب": r.rank,
        "الفريق": r.teamName,
        "قائد الفريق": r.leaderName,
        "المسار": r.hackathonTrack || "",
        "الأصوات": r.votes,
        "النسبة من إجمالي الأصوات %": r.percentOfTotal,
        [`الدرجة من ${maxScore}`]: r.score,
        "طريقة الحساب": summary.topVotes > 0 ? `${r.votes} ÷ ${summary.topVotes} × ${maxScore}` : "",
        "ضمن قائمة التصويت": r.onBallot ? "نعم" : "لا",
      }))
    );
    const meta = XLSX.utils.aoa_to_sheet([
      ["المرحلة", phaseName],
      ["إجمالي الأصوات", summary.totalVotes],
      ["أعلى عدد أصوات", summary.topVotes],
      ["عدد المصوتين", summary.voters],
      ["القاعدة", `درجة التصويت = (أصوات الفريق ÷ أعلى عدد أصوات) × ${maxScore}`],
      ["وقت التصدير (الرياض)", fmt.format(new Date())],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "النتائج");
    XLSX.utils.book_append_sheet(wb, meta, "ملخص");
    XLSX.writeFile(wb, "public_vote_results.xlsx");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>نتائج التصويت</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              درجة التصويت = (أصوات الفريق ÷ أعلى عدد أصوات) × {maxScore}. الفريق صاحب أعلى عدد أصوات يأخذ الدرجة كاملة ({maxScore})
              والباقون يأخذون حسب نسبتهم منه. «النسبة من الإجمالي» هي حصة الفريق من كل الأصوات المسجّلة.
              {refreshedAt && <span className="block text-xs">آخر تحديث: {fmt.format(refreshedAt)} — يتم التحديث تلقائياً كل 30 ثانية.</span>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث عن فريق…" className="w-56 pr-8" />
            </div>
            <Button variant="outline" onClick={exportXlsx}><Download className="ml-2 h-4 w-4" /> تصدير Excel</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-right">
                <th className="p-2 font-semibold">#</th>
                <th className="p-2 font-semibold">الفريق</th>
                <th className="p-2 font-semibold">قائد الفريق</th>
                <th className="p-2 font-semibold">المسار</th>
                <th className="p-2 font-semibold text-center">الأصوات</th>
                <th className="p-2 font-semibold text-center">النسبة من الإجمالي</th>
                <th className="p-2 font-semibold text-center">الدرجة من {maxScore}</th>
                <th className="p-2 font-semibold w-48">الحساب</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teamId} className={`border-b hover:bg-muted/30 ${!r.onBallot ? "bg-amber-50" : ""}`}>
                  <td className="p-2 font-bold">{r.rank}{r.rank === 1 && r.votes > 0 ? " 🏆" : ""}</td>
                  <td className="p-2">
                    <div className="font-semibold text-[#001742]">{r.teamName}</div>
                    {!r.onBallot && <div className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" /> خارج قائمة التصويت الحالية</div>}
                  </td>
                  <td className="p-2 text-muted-foreground">{r.leaderName || "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.hackathonTrack || "—"}</td>
                  <td className="p-2 text-center text-base font-bold tabular-nums">{r.votes}</td>
                  <td className="p-2 text-center tabular-nums">{r.percentOfTotal.toFixed(2)}%</td>
                  <td className="p-2 text-center text-base font-bold tabular-nums text-[#2F44DC]">{r.score.toFixed(2)}</td>
                  <td className="p-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#2F44DC,#53AEF5)]" style={{ width: `${summary.topVotes ? (r.votes / summary.topVotes) * 100 : 0}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                      {summary.topVotes > 0 ? `${r.votes} ÷ ${summary.topVotes} × ${maxScore} = ${r.score.toFixed(2)}` : "—"}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد فرق</td></tr>
              )}
            </tbody>
            {results.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold">
                  <td className="p-2" colSpan={4}>الإجمالي</td>
                  <td className="p-2 text-center tabular-nums">{summary.totalVotes}</td>
                  <td className="p-2 text-center">100%</td>
                  <td className="p-2" colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function VotersTab({ results }: { results: Result[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<VoterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const sp = new URLSearchParams({ limit: "5000" });
      if (q.trim()) sp.set("q", q.trim());
      if (teamId) sp.set("teamId", teamId);
      const res = await fetch(`/api/admin/votes/voters?${sp}`, { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحميل المصوّتين");
      setRows(json.votes);
      setTotal(json.total);
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر تحميل المصوّتين", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [q, teamId, toast]);

  useEffect(() => {
    const id = setTimeout(load, 300);
    return () => clearTimeout(id);
  }, [load]);

  const exportXlsx = () => {
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r, i) => ({
        "#": i + 1,
        "الاسم الأول": r.firstName,
        "اسم العائلة": r.lastName,
        "البريد الإلكتروني": r.email,
        "الفريق": r.teamName,
        "وقت التصويت (الرياض)": fmt.format(new Date(r.votedAt)),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "المصوتون");
    XLSX.writeFile(wb, "public_vote_voters.xlsx");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>المصوّتون ({total})</CardTitle>
            <CardDescription>كل بريد إلكتروني موثّق صوّت مرة واحدة. الأحدث أولاً.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="h-10 rounded-md border bg-white px-2 text-sm">
              <option value="">كل الفرق</option>
              {results.map((r) => <option key={r.teamId} value={r.teamId}>{r.teamName} ({r.votes})</option>)}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو البريد…" className="w-56 pr-8" />
            </div>
            <Button variant="outline" onClick={exportXlsx} disabled={rows.length === 0}><Download className="ml-2 h-4 w-4" /> تصدير Excel</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-right">
                  <th className="p-2 font-semibold">#</th>
                  <th className="p-2 font-semibold">الاسم</th>
                  <th className="p-2 font-semibold">البريد الإلكتروني</th>
                  <th className="p-2 font-semibold">الفريق</th>
                  <th className="p-2 font-semibold">وقت التصويت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-medium">{r.firstName} {r.lastName}</td>
                    <td className="p-2 font-mono text-xs" dir="ltr">{r.email}</td>
                    <td className="p-2">{r.teamName}</td>
                    <td className="p-2 text-xs text-muted-foreground">{fmtDate(r.votedAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد أصوات بعد</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function SettingsTab({ settings, phases, state, onSaved }: { settings: Settings; phases: Phase[]; state: State; onSaved: () => void }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [phaseId, setPhaseId] = useState(settings.phaseId || "");
  const [start, setStart] = useState(settings.votingStart ? toRiyadhInput(settings.votingStart) : "");
  const [end, setEnd] = useState(settings.votingEnd ? toRiyadhInput(settings.votingEnd) : "");
  const [maxScore, setMaxScore] = useState(String(settings.maxScore));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(settings.enabled);
    setPhaseId(settings.phaseId || "");
    setStart(settings.votingStart ? toRiyadhInput(settings.votingStart) : "");
    setEnd(settings.votingEnd ? toRiyadhInput(settings.votingEnd) : "");
    setMaxScore(String(settings.maxScore));
  }, [settings]);

  const save = async () => {
    if (enabled && !phaseId) {
      toast({ title: "تنبيه", description: "اختر مرحلة التصويت قبل التفعيل", variant: "warning" });
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/admin/votes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled,
          phaseId: phaseId || null,
          // datetime-local values are Riyadh time → sent as UTC instants
          votingStart: start ? fromRiyadhInput(start).toISOString() : null,
          votingEnd: end ? fromRiyadhInput(end).toISOString() : null,
          maxScore: Number(maxScore),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل الحفظ");
      toast({ title: "تم الحفظ", description: json.state.open ? "التصويت مفتوح الآن" : json.state.message });
      onSaved();
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> إعدادات التصويت</CardTitle>
        <CardDescription>
          تُعرض في صفحة التصويت فرق المرحلة المختارة (المقبولة وغير المعطّلة). يُغلق التصويت تلقائياً عند موعد الانتهاء — بتوقيت الرياض —
          ولا يُقبل أي صوت بعده. الحالة الآن: <strong>{state.open ? "مفتوح" : state.message}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Checkbox id="vote-enabled" checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          <Label htmlFor="vote-enabled" className="font-semibold">تفعيل تصويت الجمهور (الصفحة العامة /vote)</Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vote-phase">مرحلة التصويت</Label>
            <select id="vote-phase" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
              <option value="">— اختر المرحلة —</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.order}. {p.name}{p.isDisabled ? " (معطّلة)" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vote-max">الدرجة القصوى (وزن التصويت)</Label>
            <Input id="vote-max" type="number" min={0.5} max={100} step={0.5} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} dir="ltr" className="text-left" />
            <p className="text-xs text-muted-foreground">الافتراضي 5: أعلى فريق يأخذ 5 والباقون (أصواتهم ÷ أعلى أصوات) × 5.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vote-start">بداية التصويت (اختياري، بتوقيت الرياض)</Label>
            <input id="vote-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border bg-white p-2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vote-end">الموعد النهائي للتصويت (بتوقيت الرياض)</Label>
            <input id="vote-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border bg-white p-2" />
            <p className="text-xs text-muted-foreground">اتركه فارغاً ليبقى التصويت مفتوحاً حتى تعطّله يدوياً.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={save} disabled={saving} className="bg-[#2F44DC] hover:bg-[#2538b8]">
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />} حفظ الإعدادات
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
