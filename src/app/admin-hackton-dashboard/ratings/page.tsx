"use client";

/**
 * Admin — تقييم المستشارين: every consultant's rating per team, the team
 * average (0..100) and its share of the final score (35 % by default), the
 * consultant accounts and the settings (phase, open/closed, weight).
 * Read API: /api/admin/ratings. Accounts: /api/admin/consultants.
 *
 * Criteria (new_req/معايير التقييم - مياهثون 3.pdf): 20 / 20 / 30 / 15 / 15 = 100.
 * One consultant's total = Σ (value ÷ 5 × weight). Team total = AVERAGE of
 * its consultants' totals (so five consultants never push it above 100).
 * Final share = average × finalWeight ÷ 100.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ClipboardCheck, Users, Trophy, Clock, RefreshCw, Save, Loader2, Download, Search, AlertTriangle, Lock, Unlock,
  ChevronDown, ChevronUp, Plus, KeyRound, Ban, CheckCircle2, Trash2, Copy, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "../../../../components/ui/use-toast";
import { APP_TIME_ZONE } from "@/lib/riyadh-time";

interface Settings { enabled: boolean; phaseId: string | null; finalWeight: number; updatedAt: string }
interface Phase { id: string; name: string; order: number; isDisabled: boolean }
interface Criterion { key: string; title: string; description: string; weight: number }
interface Consultant { id: string; username: string; name: string; email: string | null; isDisabled: boolean; createdAt: string; ratedCount: number }
interface RatingRow { consultantId: string; consultantName: string; scores: Record<string, number>; total: number; notes: string | null; createdAt: string; updatedAt: string }
interface Result {
  teamId: string; teamName: string; leaderName: string; hackathonTrack: string | null; membersCount: number; onPhase: boolean;
  ratingsCount: number; avgTotal: number; finalShare: number; criterionAvg: Record<string, number>; criterionAvgScore: Record<string, number>;
  ratings: RatingRow[]; rank: number | null;
}
interface Summary { teamsOnPhase: number; teamsRated: number; teamsFullyRated: number; consultantsActive: number; totalRatings: number; lastRatingAt: string | null }
interface Payload { settings: Settings; serverTime: string; phases: Phase[]; criteria: Criterion[]; consultants: Consultant[]; summary: Summary; results: Result[] }

const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: APP_TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const fmtDate = (v: string | null | undefined) => (v ? fmt.format(new Date(v)) : "—");
const n2 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

export default function RatingsAdminPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/admin/ratings", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحميل بيانات التقييم");
      setData(json);
      setRefreshedAt(new Date());
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر تحميل بيانات التقييم", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!data) return <p className="p-6 text-center text-red-500">تعذر تحميل البيانات</p>;

  const { settings, summary, results, phases, criteria, consultants } = data;
  const phaseName = phases.find((p) => p.id === settings.phaseId)?.name || "—";
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/consultant-login` : "/consultant-login";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><ClipboardCheck className="h-8 w-8 text-[#2F44DC]" /> تقييم المستشارين</h1>
          <p className="mt-1 text-sm text-muted-foreground">المرحلة: {phaseName} · وزن التقييم في الدرجة النهائية: {settings.finalWeight}%</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {settings.enabled
            ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><Unlock className="ml-1 h-3 w-3" /> التقييم مفتوح</Badge>
            : <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><Lock className="ml-1 h-3 w-3" /> التقييم مغلق</Badge>}
          <Button variant="outline" size="sm" onClick={() => load(true)}><RefreshCw className="ml-2 h-4 w-4" /> تحديث</Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/consultant-login" target="_blank" rel="noreferrer"><ExternalLink className="ml-2 h-4 w-4" /> صفحة دخول المستشارين</a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(loginUrl).then(() => toast({ title: "تم النسخ", description: loginUrl }))}>
            <Copy className="ml-2 h-4 w-4" /> نسخ الرابط
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile icon={Users} label="فرق المرحلة" value={summary.teamsOnPhase} />
        <Tile icon={ClipboardCheck} label="فرق قُيّمت (مستشار واحد على الأقل)" value={`${summary.teamsRated} / ${summary.teamsOnPhase}`} sub={`اكتمل تقييمها من الجميع: ${summary.teamsFullyRated}`} />
        <Tile icon={Users} label="المستشارون النشطون" value={summary.consultantsActive} sub={`إجمالي التقييمات: ${summary.totalRatings}`} />
        <Tile icon={Trophy} label="أعلى متوسط" value={results[0]?.ratingsCount ? n2(results[0].avgTotal) : "—"} sub={results[0]?.ratingsCount ? results[0].teamName : undefined} />
        <Tile icon={Clock} label="آخر تقييم" value={fmtDate(summary.lastRatingAt)} small />
      </div>

      <Tabs defaultValue="results" dir="rtl">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="results">النتائج والدرجات</TabsTrigger>
          <TabsTrigger value="details">تقييمات المستشارين</TabsTrigger>
          <TabsTrigger value="consultants">حسابات المستشارين</TabsTrigger>
          <TabsTrigger value="settings">إعدادات التقييم</TabsTrigger>
        </TabsList>
        <TabsContent value="results">
          <ResultsTab results={results} criteria={criteria} settings={settings} phaseName={phaseName} refreshedAt={refreshedAt} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsTab results={results} criteria={criteria} consultants={consultants} />
        </TabsContent>
        <TabsContent value="consultants">
          <ConsultantsTab consultants={consultants} onChanged={() => load(true)} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab settings={settings} phases={phases} criteria={criteria} onSaved={() => load(true)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tile({ icon: Icon, label, value, sub, small }: { icon: typeof Users; label: string; value: number | string; sub?: string; small?: boolean }) {
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

function ResultsTab({ results, criteria, settings, phaseName, refreshedAt }: { results: Result[]; criteria: Criterion[]; settings: Settings; phaseName: string; refreshedAt: Date | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? results.filter((r) => r.teamName.toLowerCase().includes(s) || r.leaderName.toLowerCase().includes(s)) : results;
  }, [results, q]);

  const exportXlsx = () => {
    const sheet = XLSX.utils.json_to_sheet(
      results.map((r) => {
        const row: Record<string, string | number> = {
          "الترتيب": r.rank ?? "",
          "الفريق": r.teamName,
          "قائد الفريق": r.leaderName,
          "المسار": r.hackathonTrack || "",
          "عدد المستشارين": r.ratingsCount,
        };
        for (const c of criteria) {
          row[`${c.title} (متوسط /5)`] = r.ratingsCount ? r.criterionAvg[c.key] : "";
          row[`${c.title} (درجة /${c.weight})`] = r.ratingsCount ? r.criterionAvgScore[c.key] : "";
        }
        row["المتوسط من 100"] = r.ratingsCount ? r.avgTotal : "";
        row[`الدرجة النهائية من ${settings.finalWeight}`] = r.ratingsCount ? r.finalShare : "";
        row["ضمن مرحلة التقييم"] = r.onPhase ? "نعم" : "لا";
        return row;
      })
    );
    const details = XLSX.utils.json_to_sheet(
      results.flatMap((r) => r.ratings.map((x) => {
        const row: Record<string, string | number> = { "الفريق": r.teamName, "المستشار": x.consultantName };
        for (const c of criteria) row[c.title] = x.scores[c.key] ?? "";
        row["المجموع من 100"] = x.total;
        row["ملاحظات"] = x.notes || "";
        row["آخر تحديث (الرياض)"] = fmt.format(new Date(x.updatedAt));
        return row;
      }))
    );
    const meta = XLSX.utils.aoa_to_sheet([
      ["المرحلة", phaseName],
      ["وزن التقييم في الدرجة النهائية", `${settings.finalWeight}%`],
      ["القاعدة", "درجة المعيار = (التقدير من 5 ÷ 5) × وزن المعيار؛ مجموع المستشار من 100؛ درجة الفريق = متوسط المستشارين؛ الدرجة النهائية = المتوسط × الوزن ÷ 100"],
      ["المعايير", criteria.map((c) => `${c.title} (${c.weight})`).join(" · ")],
      ["وقت التصدير (الرياض)", fmt.format(new Date())],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "النتائج");
    XLSX.utils.book_append_sheet(wb, details, "تقييمات المستشارين");
    XLSX.utils.book_append_sheet(wb, meta, "ملخص");
    XLSX.writeFile(wb, "consultant_ratings_results.xlsx");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>نتائج تقييم المستشارين</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              درجة الفريق = متوسط مجموع المستشارين الذين قيّموه (من 100)، والدرجة النهائية = المتوسط × {settings.finalWeight} ÷ 100.
              المتوسط لا يزيد عن 100 مهما كان عدد المستشارين. اضغط على الصف لعرض تقييم كل مستشار.
              {refreshedAt && <span className="block text-xs">آخر تحديث: {fmt.format(refreshedAt)} — يتم التحديث تلقائياً كل دقيقة.</span>}
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
                <th className="p-2 text-center font-semibold">المستشارون</th>
                {criteria.map((c) => (
                  <th key={c.key} className="p-2 text-center text-xs font-semibold" title={c.description}>{c.title}<div className="font-normal text-muted-foreground">/{c.weight}</div></th>
                ))}
                <th className="p-2 text-center font-semibold">المتوسط /100</th>
                <th className="p-2 text-center font-semibold">النهائية /{n2(settings.finalWeight)}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowGroup key={r.teamId} r={r} criteria={criteria} open={!!open[r.teamId]} toggle={() => setOpen((o) => ({ ...o, [r.teamId]: !o[r.teamId] }))} />
              ))}
              {rows.length === 0 && <tr><td colSpan={criteria.length + 6} className="p-8 text-center text-muted-foreground">لا توجد فرق</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RowGroup({ r, criteria, open, toggle }: { r: Result; criteria: Criterion[]; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr onClick={toggle} className={`cursor-pointer border-b hover:bg-muted/30 ${!r.onPhase ? "bg-amber-50" : ""}`}>
        <td className="p-2 font-bold">{r.rank ?? "—"}{r.rank === 1 ? " 🏆" : ""}</td>
        <td className="p-2">
          <div className="font-semibold text-[#001742]">{r.teamName}</div>
          <div className="text-xs text-muted-foreground">{r.leaderName || "—"}{r.hackathonTrack ? ` · ${r.hackathonTrack}` : ""}</div>
          {!r.onPhase && <div className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" /> خارج مرحلة التقييم الحالية</div>}
        </td>
        <td className="p-2 text-center tabular-nums">{r.ratingsCount}</td>
        {criteria.map((c) => (
          <td key={c.key} className="p-2 text-center text-xs tabular-nums">
            {r.ratingsCount ? <><span className="font-semibold">{n2(r.criterionAvgScore[c.key])}</span><div className="text-muted-foreground">{n2(r.criterionAvg[c.key])} / 5</div></> : "—"}
          </td>
        ))}
        <td className="p-2 text-center text-base font-bold tabular-nums">{r.ratingsCount ? n2(r.avgTotal) : "—"}</td>
        <td className="p-2 text-center text-base font-bold tabular-nums text-[#2F44DC]">{r.ratingsCount ? n2(r.finalShare) : "—"}</td>
        <td className="p-2 text-center text-muted-foreground">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>
      {open && (
        <tr className="border-b bg-slate-50/70">
          <td colSpan={criteria.length + 6} className="p-3">
            {r.ratings.length === 0 ? (
              <p className="text-xs text-muted-foreground">لم يقيّم أي مستشار هذا الفريق بعد.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-muted-foreground">
                    <th className="p-1.5 font-medium">المستشار</th>
                    {criteria.map((c) => <th key={c.key} className="p-1.5 text-center font-medium">{c.title}</th>)}
                    <th className="p-1.5 text-center font-medium">المجموع</th>
                    <th className="p-1.5 font-medium">ملاحظات</th>
                    <th className="p-1.5 font-medium">آخر تحديث</th>
                  </tr>
                </thead>
                <tbody>
                  {r.ratings.map((x) => (
                    <tr key={x.consultantId} className="border-t">
                      <td className="p-1.5 font-semibold">{x.consultantName}</td>
                      {criteria.map((c) => <td key={c.key} className="p-1.5 text-center tabular-nums">{x.scores[c.key] ?? "—"} <span className="text-muted-foreground">({n2(((x.scores[c.key] || 0) / 5) * c.weight)})</span></td>)}
                      <td className="p-1.5 text-center font-bold tabular-nums">{n2(x.total)}</td>
                      <td className="max-w-xs p-1.5 text-muted-foreground">{x.notes || "—"}</td>
                      <td className="p-1.5 text-muted-foreground">{fmtDate(x.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function DetailsTab({ results, criteria, consultants }: { results: Result[]; criteria: Criterion[]; consultants: Consultant[] }) {
  const [consultantId, setConsultantId] = useState("");
  const [q, setQ] = useState("");
  const flat = useMemo(() => {
    const s = q.trim().toLowerCase();
    return results
      .flatMap((r) => r.ratings.map((x) => ({ ...x, teamId: r.teamId, teamName: r.teamName, onPhase: r.onPhase })))
      .filter((x) => (!consultantId || x.consultantId === consultantId) && (!s || x.teamName.toLowerCase().includes(s) || x.consultantName.toLowerCase().includes(s)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [results, consultantId, q]);

  const exportXlsx = () => {
    const sheet = XLSX.utils.json_to_sheet(flat.map((x, i) => {
      const row: Record<string, string | number> = { "#": i + 1, "المستشار": x.consultantName, "الفريق": x.teamName };
      for (const c of criteria) row[`${c.title} (/5)`] = x.scores[c.key] ?? "";
      row["المجموع من 100"] = x.total;
      row["ملاحظات"] = x.notes || "";
      row["أول حفظ (الرياض)"] = fmt.format(new Date(x.createdAt));
      row["آخر تحديث (الرياض)"] = fmt.format(new Date(x.updatedAt));
      return row;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "التقييمات");
    XLSX.writeFile(wb, "consultant_ratings_details.xlsx");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>تقييمات المستشارين ({flat.length})</CardTitle>
            <CardDescription>كل تقييم على حدة — المستشار، الفريق، التقدير لكل معيار والمجموع. الأحدث أولاً.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)} className="h-10 rounded-md border bg-white px-2 text-sm">
              <option value="">كل المستشارين</option>
              {consultants.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ratedCount})</option>)}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالفريق أو المستشار…" className="w-56 pr-8" />
            </div>
            <Button variant="outline" onClick={exportXlsx} disabled={flat.length === 0}><Download className="ml-2 h-4 w-4" /> تصدير Excel</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-right">
                <th className="p-2 font-semibold">المستشار</th>
                <th className="p-2 font-semibold">الفريق</th>
                {criteria.map((c) => <th key={c.key} className="p-2 text-center text-xs font-semibold">{c.title}<div className="font-normal text-muted-foreground">/5</div></th>)}
                <th className="p-2 text-center font-semibold">المجموع /100</th>
                <th className="p-2 font-semibold">ملاحظات</th>
                <th className="p-2 font-semibold">آخر تحديث</th>
              </tr>
            </thead>
            <tbody>
              {flat.map((x) => (
                <tr key={`${x.consultantId}-${x.teamId}`} className="border-b hover:bg-muted/30">
                  <td className="p-2 font-semibold">{x.consultantName}</td>
                  <td className="p-2 text-[#001742]">{x.teamName}{!x.onPhase && <span className="mr-1 text-xs text-amber-700">(خارج المرحلة)</span>}</td>
                  {criteria.map((c) => <td key={c.key} className="p-2 text-center tabular-nums">{x.scores[c.key] ?? "—"}</td>)}
                  <td className="p-2 text-center font-bold tabular-nums">{n2(x.total)}</td>
                  <td className="max-w-xs p-2 text-xs text-muted-foreground">{x.notes || "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{fmtDate(x.updatedAt)}</td>
                </tr>
              ))}
              {flat.length === 0 && <tr><td colSpan={criteria.length + 5} className="p-8 text-center text-muted-foreground">لا توجد تقييمات</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ConsultantsTab({ consultants, onChanged }: { consultants: Consultant[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ username: "", name: "", email: "", password: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const call = async (label: string, url: string, init: RequestInit) => {
    setBusy(label);
    try {
      const res = await fetch(url, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "فشل الطلب");
      return json;
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الطلب", variant: "destructive" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const json = await call("create", "/api/admin/consultants", { method: "POST", body: JSON.stringify(form) });
    if (!json) return;
    setRevealed({ username: json.consultant.username, password: json.password });
    setForm({ username: "", name: "", email: "", password: "" });
    toast({ title: "تم إنشاء الحساب", description: `${json.consultant.name} (${json.consultant.username})` });
    onChanged();
  };
  const resetPassword = async (c: Consultant) => {
    const json = await call(`reset-${c.id}`, `/api/admin/consultants/${c.id}`, { method: "PATCH", body: JSON.stringify({ resetPassword: true }) });
    if (!json) return;
    setRevealed({ username: c.username, password: json.password });
    onChanged();
  };
  const toggleDisabled = async (c: Consultant) => {
    const json = await call(`toggle-${c.id}`, `/api/admin/consultants/${c.id}`, { method: "PATCH", body: JSON.stringify({ isDisabled: !c.isDisabled }) });
    if (!json) return;
    toast({ title: c.isDisabled ? "تم تفعيل الحساب" : "تم تعطيل الحساب", description: c.name });
    onChanged();
  };
  const remove = async (c: Consultant) => {
    const json = await call(`delete-${c.id}`, `/api/admin/consultants/${c.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!json) return;
    toast({ title: "تم حذف الحساب", description: `${c.name} — حُذف معه ${json.deletedRatings} تقييم` });
    onChanged();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>حسابات المستشارين ({consultants.length})</CardTitle>
          <CardDescription>يدخل المستشار من <span dir="ltr">/consultant-login</span> باسم المستخدم وكلمة المرور. تعطيل الحساب يمنع الدخول فوراً ويُخفي تقييماته من المتوسطات؛ الحذف يحذف تقييماته نهائياً.</CardDescription>
        </CardHeader>
        <CardContent>
          {revealed && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="font-semibold">بيانات الدخول — تظهر مرة واحدة فقط، انسخها الآن:</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 font-mono" dir="ltr">
                <span>user: <b>{revealed.username}</b></span>
                <span>password: <b>{revealed.password}</b></span>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(`username: ${revealed.username}\npassword: ${revealed.password}`).then(() => toast({ title: "تم النسخ" }))}><Copy className="ml-1 h-3 w-3" /> نسخ</Button>
                <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>إخفاء</Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-right">
                  <th className="p-2 font-semibold">الاسم</th>
                  <th className="p-2 font-semibold">اسم المستخدم</th>
                  <th className="p-2 font-semibold">البريد</th>
                  <th className="p-2 text-center font-semibold">الفرق المقيّمة</th>
                  <th className="p-2 font-semibold">الحالة</th>
                  <th className="p-2 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {consultants.map((c) => (
                  <tr key={c.id} className={`border-b ${c.isDisabled ? "bg-gray-50 text-muted-foreground" : ""}`}>
                    <td className="p-2 font-semibold">{c.name}</td>
                    <td className="p-2 font-mono text-xs" dir="ltr">{c.username}</td>
                    <td className="p-2 text-xs" dir="ltr">{c.email || "—"}</td>
                    <td className="p-2 text-center tabular-nums">{c.ratedCount}</td>
                    <td className="p-2">{c.isDisabled ? <Badge variant="secondary">معطّل</Badge> : <Badge className="bg-green-100 text-green-800 hover:bg-green-100">نشط</Badge>}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => resetPassword(c)} title="كلمة مرور جديدة"><KeyRound className="ml-1 h-3 w-3" /> كلمة المرور</Button>
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => toggleDisabled(c)}>
                          {c.isDisabled ? <><CheckCircle2 className="ml-1 h-3 w-3" /> تفعيل</> : <><Ban className="ml-1 h-3 w-3" /> تعطيل</>}
                        </Button>
                        {confirmDelete === c.id ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                            حذف الحساب و{c.ratedCount} تقييم؟
                            <Button size="sm" variant="destructive" className="h-6 px-2" disabled={!!busy} onClick={() => remove(c)}>نعم، احذف</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setConfirmDelete(null)}>إلغاء</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={!!busy} onClick={() => setConfirmDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {consultants.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد حسابات بعد — أنشئ أول حساب من النموذج المجاور.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> حساب مستشار جديد</CardTitle>
          <CardDescription>اترك كلمة المرور فارغة لتوليد كلمة قوية تلقائياً.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="c-name">الاسم الظاهر</Label>
              <Input id="c-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="م. فلان الفلاني" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-user">اسم المستخدم</Label>
              <Input id="c-user" required dir="ltr" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="consultant1" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-email">البريد الإلكتروني (اختياري)</Label>
              <Input id="c-email" dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-pass">كلمة المرور (اختياري، 8 أحرف فأكثر)</Label>
              <Input id="c-pass" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <Button type="submit" className="w-full" disabled={busy === "create"}>{busy === "create" ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Plus className="ml-2 h-4 w-4" />} إنشاء الحساب</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SettingsTab({ settings, phases, criteria, onSaved }: { settings: Settings; phases: Phase[]; criteria: Criterion[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [phaseId, setPhaseId] = useState(settings.phaseId || "");
  const [finalWeight, setFinalWeight] = useState(String(settings.finalWeight));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(settings.enabled);
    setPhaseId(settings.phaseId || "");
    setFinalWeight(String(settings.finalWeight));
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled, phaseId: phaseId || null, finalWeight: Number(finalWeight) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر حفظ الإعدادات");
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات التقييم" });
      onSaved();
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>إعدادات التقييم</CardTitle>
          <CardDescription>تغيير المرحلة يغيّر الفرق التي يراها المستشارون؛ التقييمات المحفوظة لا تُحذف.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
            <span>التقييم مفتوح (يمكن للمستشارين حفظ وتعديل تقييماتهم)</span>
          </label>
          <div className="space-y-1">
            <Label>مرحلة التقييم</Label>
            <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
              <option value="">— غير محددة —</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.order}. {p.name}{p.isDisabled ? " (معطّلة)" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="final-weight">وزن تقييم المستشارين في الدرجة النهائية (%)</Label>
            <Input id="final-weight" type="number" min={1} max={100} step="0.5" value={finalWeight} onChange={(e) => setFinalWeight(e.target.value)} className="w-40" />
            <p className="text-xs text-muted-foreground">الدرجة النهائية للفريق = متوسطه من 100 × {finalWeight || "—"} ÷ 100. مثال: متوسط 80 ← {finalWeight ? n2((80 * Number(finalWeight)) / 100) : "—"}.</p>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />} حفظ الإعدادات</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>معايير التقييم</CardTitle>
          <CardDescription>وفق ملف «معايير التقييم - مياهثون 3». التقدير من 1 إلى 5 لكل معيار، ودرجة المعيار = (التقدير ÷ 5) × الوزن.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-right">
                <th className="p-2 font-semibold">المعيار</th>
                <th className="p-2 font-semibold">الوصف</th>
                <th className="p-2 text-center font-semibold">الوزن %</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, i) => (
                <tr key={c.key} className="border-b">
                  <td className="p-2 font-semibold text-[#001742]">{i + 1}. {c.title}</td>
                  <td className="p-2 text-xs text-muted-foreground">{c.description}</td>
                  <td className="p-2 text-center font-bold tabular-nums">{c.weight}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold"><td className="p-2" colSpan={2}>المجموع</td><td className="p-2 text-center tabular-nums">{totalWeight}</td></tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
