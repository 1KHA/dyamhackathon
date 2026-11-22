"use client";

/**
 * Public voting page (/vote) — تصويت الجمهور.
 *
 * A wall of team cards for the voting phase. Hovering (or tapping, on touch
 * screens) a card reveals the idea; a visitor picks ONE team, enters their
 * name + email, confirms a 6-digit code sent to that email, then casts the
 * vote. One vote per email, enforced server-side (see src/lib/voting.ts).
 * No login, no vote counts shown here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Search, User, Users, Crown, CheckCircle2, Clock, Lock, Mail, KeyRound, Vote, ChevronLeft, Loader2, AlertCircle, X, Eye, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_TIME_ZONE } from "@/lib/riyadh-time";

interface BallotTeam {
  id: string;
  teamName: string;
  leaderName: string;
  /** Every member's name, leader first (older ballots may omit it). */
  members?: string[];
  hackathonTrack: string | null;
  ideaDescription: string;
}
type VotingState =
  | { open: true; endsAt: string | null }
  | { open: false; reason: string; message: string; startsAt?: string | null; endedAt?: string | null };
interface Ballot {
  state: VotingState;
  phaseName: string | null;
  votingStart: string | null;
  votingEnd: string | null;
  serverTime: string;
  teams: BallotTeam[];
}

type Step = "info" | "otp" | "confirm" | "done";

const DONE_KEY = "miyahthon-vote-done";

const fmtDateTime = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: APP_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** One style for every track chip (brand tint). */
function trackColor(_track: string | null): string {
  return "bg-[#2F44DC]/10 text-[#2F44DC] border-[#2F44DC]/20";
}

/**
 * Members block of the «الفكرة كاملة» dialog: the leader first (marked), then
 * every other member. The API sends names only, leader first.
 */
function TeamMembers({ team }: { team: BallotTeam }) {
  const members = team.members || [];
  const leader = team.leaderName;
  const leaderIdx = leader ? members.indexOf(leader) : -1;
  const others = leaderIdx >= 0 ? members.filter((_, i) => i !== leaderIdx) : members;
  const total = others.length + (leader ? 1 : 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[#001742]">
        <Users className="h-4 w-4 text-[#2F44DC]" />
        أعضاء الفريق
        <span className="text-xs font-normal text-slate-500">({total})</span>
      </p>
      {total === 0 ? (
        <p className="text-sm text-slate-500">لم تُسجَّل أسماء الأعضاء.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {leader && (
            <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#2F44DC]/30 bg-[#2F44DC]/10 px-3 py-1 text-sm font-semibold text-[#2F44DC]">
              <Crown className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{leader}</span>
              <span className="shrink-0 text-[11px] font-normal">قائد الفريق</span>
            </li>
          )}
          {others.map((name, i) => (
            <li key={`${name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
              <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function PublicVotePage() {
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null); // tapped card (touch)
  const [detailsTeam, setDetailsTeam] = useState<BallotTeam | null>(null);
  const [voteOpen, setVoteOpen] = useState(false);
  // the team the dialog is about — kept separately so the success screen
  // stays mounted after the selection is cleared
  const [voteTeam, setVoteTeam] = useState<BallotTeam | null>(null);
  const [alreadyDone, setAlreadyDone] = useState<{ teamName: string } | null>(null);
  // server clock offset so the countdown ignores the device clock
  const offsetRef = useRef(0);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch("/api/vote/teams", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تحميل قائمة الفرق");
      offsetRef.current = new Date(data.serverTime).getTime() - Date.now();
      setBallot(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "تعذر تحميل قائمة الفرق");
    }
  }, []);

  useEffect(() => {
    load();
    try {
      const raw = localStorage.getItem(DONE_KEY);
      if (raw) setAlreadyDone(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [load]);

  // countdown tick + auto-close at the deadline
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1);
      if (ballot?.state.open && ballot.votingEnd) {
        const now = Date.now() + offsetRef.current;
        if (now >= new Date(ballot.votingEnd).getTime()) load();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ballot, load]);

  const teams = ballot?.teams ?? [];
  const tracks = useMemo(() => {
    const set = new Map<string, number>();
    for (const t of teams) if (t.hackathonTrack) set.set(t.hackathonTrack, (set.get(t.hackathonTrack) || 0) + 1);
    return Array.from(set.entries());
  }, [teams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((t) => {
      if (track !== "all" && t.hackathonTrack !== track) return false;
      if (!q) return true;
      return (
        t.teamName.toLowerCase().includes(q) ||
        t.leaderName.toLowerCase().includes(q) ||
        (t.members || []).some((m) => m.toLowerCase().includes(q)) ||
        t.ideaDescription.toLowerCase().includes(q)
      );
    });
  }, [teams, search, track]);

  const selected = teams.find((t) => t.id === selectedId) || null;
  const isOpen = ballot?.state.open === true;

  const remaining = (() => {
    if (!ballot?.votingEnd || !isOpen) return null;
    const ms = new Date(ballot.votingEnd).getTime() - (Date.now() + offsetRef.current);
    if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0 };
    const s = Math.floor(ms / 1000);
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  })();

  const choose = (team: BallotTeam) => {
    if (!isOpen || alreadyDone) return;
    setSelectedId(team.id);
    setDetailsTeam(null);
    setActiveId(null);
  };

  const onVoted = (teamName: string) => {
    const rec = { teamName, at: new Date().toISOString() };
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(rec));
    } catch {
      /* ignore */
    }
    setAlreadyDone(rec);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900" dir="rtl">
      {/* ---------------------------------------------------------------- header */}
      <header className="relative overflow-hidden bg-[#001742] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#001742_0%,#2F44DC_55%,#53AEF5_100%)] opacity-95" />
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 right-10 h-80 w-80 rounded-full bg-[#53AEF5]/30 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Image src="/logo2.png" alt="مياهثون" width={216} height={59} className="h-10 w-auto" priority />
          </div>
          <div className="mt-8 max-w-3xl">
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">تصويت الجمهور</h1>
            <ol className="mt-5 grid gap-3 text-sm text-white/90 sm:grid-cols-2 sm:text-base">
              {[
                "تصفّح أفكار الفرق المتأهلة.",
                "مرّر المؤشر على أي بطاقة (أو اضغط عليها) لقراءة الفكرة.",
                "اختر فريقاً واحداً واضغط «صوّت الآن».",
                "أدخل اسمك وبريدك الإلكتروني، ثم أدخل رمز التحقق الذي يصلك على البريد لتأكيد صوتك.",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#2F44DC]">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* status strip */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {ballot === null && !loadError && (
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
              </span>
            )}
            {isOpen && remaining && (
              <div className="inline-flex items-center gap-3 rounded-xl bg-white/15 px-4 py-2 backdrop-blur">
                <Clock className="h-5 w-5" />
                <span className="text-sm">ينتهي التصويت خلال</span>
                {remaining.d > 0 && (
                  <span className="text-lg font-bold tabular-nums">{remaining.d} {remaining.d === 1 ? "يوم" : remaining.d === 2 ? "يومان" : remaining.d <= 10 ? "أيام" : "يوم"}</span>
                )}
                <span className="font-mono text-lg font-bold tabular-nums" dir="ltr">
                  {pad(remaining.h)}:{pad(remaining.m)}:{pad(remaining.s)}
                </span>
              </div>
            )}
            {isOpen && ballot?.votingEnd && (
              <span className="text-xs text-white/75 sm:text-sm">
                آخر موعد: {fmtDateTime.format(new Date(ballot.votingEnd))} (بتوقيت الرياض)
              </span>
            )}
            {isOpen && !ballot?.votingEnd && <span className="text-sm text-white/85">التصويت مفتوح الآن</span>}
            {ballot && !isOpen && (
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2">
                <Lock className="h-5 w-5" />
                <span className="text-sm font-semibold">{(ballot.state as { message: string }).message}</span>
                {ballot.state.open === false && ballot.state.reason === "not-started" && ballot.votingStart && (
                  <span className="text-xs text-white/80">— يبدأ {fmtDateTime.format(new Date(ballot.votingStart))}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
        {loadError && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <span className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> {loadError}</span>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="ml-2 h-4 w-4" /> إعادة المحاولة</Button>
          </div>
        )}

        {alreadyDone && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">تم تسجيل صوتك لفريق «{alreadyDone.teamName}». شكراً لمشاركتك!</p>
              <p className="text-sm text-emerald-800/80">يُسمح بصوت واحد فقط لكل بريد إلكتروني.</p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ toolbar */}
        {teams.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="relative">
              {/* arbitrary values on purpose: globals.css mirrors right-3 / pr-10 in RTL */}
              <Search className="pointer-events-none absolute right-[14px] top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الفريق أو اسم أحد الأعضاء أو كلمة من الفكرة…"
                className="h-11 rounded-xl bg-white pr-[44px] pl-[16px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[["all", "كل المسارات", teams.length] as const, ...tracks.map(([name, n]) => [name, name, n] as const)].map(([key, label, n]) => {
                const active = track === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTrack(active && key !== "all" ? "all" : key)}
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-xs leading-snug transition sm:text-sm ${
                      active ? "border-[#2F44DC] bg-[#2F44DC] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-[#2F44DC]/40 hover:bg-[#2F44DC]/5"
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* --------------------------------------------------------------- grid */}
        {ballot && teams.length === 0 && !loadError && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            {isOpen ? "لا توجد فرق في قائمة التصويت حالياً." : (ballot.state as { message: string }).message}
          </div>
        )}
        {filtered.length === 0 && teams.length > 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            لا توجد نتائج مطابقة للبحث.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((team, i) => {
            const isSelected = team.id === selectedId;
            const isActive = team.id === activeId;
            return (
              <article
                key={team.id}
                data-active={isActive || undefined}
                onClick={() => setActiveId(isActive ? null : team.id)}
                className={`group relative flex min-h-[200px] cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  isSelected ? "border-[#2F44DC] ring-4 ring-[#2F44DC]/25" : "border-slate-200"
                }`}
                style={{ animation: `vote-fade-in .4s ease both`, animationDelay: `${Math.min(i, 24) * 25}ms` }}
              >
                <div className="mb-6 flex items-start justify-between gap-2">
                  {team.hackathonTrack ? (
                    <span className={`inline-flex h-6 min-w-0 max-w-full items-center rounded-full border px-2.5 text-[11px] font-medium ${trackColor(team.hackathonTrack)}`}>
                      <span className="truncate leading-6">{team.hackathonTrack}</span>
                    </span>
                  ) : <span />}
                  {isSelected && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#2F44DC] px-2 py-0.5 text-[11px] font-semibold text-white">
                      <CheckCircle2 className="h-3 w-3" /> اختيارك
                    </span>
                  )}
                </div>
                <h3 className="line-clamp-3 text-xl font-bold leading-snug text-[#001742]">{team.teamName}</h3>
                <p className="mt-auto pt-6 text-xs text-slate-400 group-hover:opacity-0 group-data-[active]:opacity-0">
                  مرّر المؤشر أو اضغط لقراءة الفكرة
                </p>

                {/* hover / tap overlay */}
                <div
                  className="absolute inset-0 flex translate-y-full flex-col bg-[linear-gradient(160deg,#001742_0%,#1a2fb8_100%)] p-5 text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-data-[active]:translate-y-0 group-data-[active]:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="line-clamp-1 text-sm font-bold">{team.teamName}</h4>
                    <button type="button" className="rounded-full p-1 hover:bg-white/15 sm:hidden" onClick={() => setActiveId(null)} aria-label="إغلاق">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="line-clamp-6 text-[13px] leading-relaxed text-white/90">
                    {team.ideaDescription || "لا يوجد وصف للفكرة."}
                  </p>
                  <div className="mt-auto flex gap-2 pt-3">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 gap-2 bg-[#53AEF5] text-[#001742] hover:bg-[#7cc1f8] disabled:opacity-50"
                      disabled={!isOpen || !!alreadyDone}
                      onClick={() => choose(team)}
                    >
                      {isSelected ? "تم الاختيار" : "اختيار"} <Vote className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="flex-1 gap-2 bg-white/15 text-white hover:bg-white/25"
                      onClick={() => setDetailsTeam(team)}
                    >
                      الفكرة كاملة <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* ------------------------------------------------------- sticky vote bar */}
      {selected && isOpen && !alreadyDone && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-8px_30px_rgba(0,23,66,.12)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">اخترت فريق</p>
              <p className="truncate text-lg font-bold text-[#001742]">{selected.teamName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}>تغيير الاختيار</Button>
              <Button className="bg-[#2F44DC] px-6 hover:bg-[#2538b8]" onClick={() => { setVoteTeam(selected); setVoteOpen(true); }}>
                <Vote className="ml-2 h-5 w-5" /> صوّت الآن
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- details dialog */}
      <Dialog open={!!detailsTeam} onOpenChange={(o) => !o && setDetailsTeam(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          {detailsTeam && (
            <>
              <DialogHeader className="text-right">
                {detailsTeam.hackathonTrack && (
                  <span className={`mb-2 inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[11px] font-medium leading-6 ${trackColor(detailsTeam.hackathonTrack)}`}>
                    {detailsTeam.hackathonTrack}
                  </span>
                )}
                <DialogTitle className="text-2xl text-[#001742]">{detailsTeam.teamName}</DialogTitle>
                {/* kept for screen readers only; the leader is shown in the members block below */}
                <DialogDescription className="sr-only">أعضاء الفريق والفكرة كاملة</DialogDescription>
              </DialogHeader>
              <TeamMembers team={detailsTeam} />
              <div className="max-h-[40vh] overflow-y-auto rounded-xl bg-slate-50 p-4 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap" dir="auto">
                {detailsTeam.ideaDescription || "لا يوجد وصف للفكرة."}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDetailsTeam(null)}>إغلاق</Button>
                <Button className="bg-[#2F44DC] hover:bg-[#2538b8]" disabled={!isOpen || !!alreadyDone} onClick={() => choose(detailsTeam)}>
                  <Vote className="ml-2 h-4 w-4" /> اختيار هذا الفريق
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------ vote dialog */}
      {voteTeam && (
        <VoteDialog
          open={voteOpen}
          team={voteTeam}
          onClose={() => setVoteOpen(false)}
          onVoted={(name) => {
            onVoted(name);
            setSelectedId(null);
          }}
          onClosedByServer={() => {
            setVoteOpen(false);
            load();
          }}
        />
      )}

      <style jsx global>{`
        @keyframes vote-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// Vote dialog: info → otp → confirm → done
// ===========================================================================

function VoteDialog({
  open, team, onClose, onVoted, onClosedByServer,
}: {
  open: boolean;
  team: BallotTeam;
  onClose: () => void;
  onVoted: (teamName: string) => void;
  onClosedByServer: () => void;
}) {
  const [step, setStep] = useState<Step>("info");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [voteToken, setVoteToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [doneMessage, setDoneMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("info");
    setCode("");
    setVoteToken(null);
    setError(null);
    setInfo(null);
    setResendIn(0);
  }, [open, team.id]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const requestOtp = async () => {
    setError(null);
    setInfo(null);
    if (!firstName.trim() || !lastName.trim()) return setError("يرجى إدخال الاسم الأول واسم العائلة.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("يرجى إدخال بريد إلكتروني صحيح.");
    setBusy(true);
    try {
      const { res, data } = await post("/api/vote/request-otp", { firstName, lastName, email, teamId: team.id });
      if (res.status === 403 && data.state) return onClosedByServer();
      if (!res.ok) {
        if (data.retryAfter) setResendIn(Number(data.retryAfter));
        if (data.alreadyVoted) {
          setError(data.error);
          return;
        }
        return setError(data.error || "تعذر إرسال الرمز.");
      }
      setInfo(data.message);
      setResendIn(Number(data.resendAfterSeconds) || 60);
      setStep("otp");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) return setError("أدخل الرمز المكوّن من 6 أرقام.");
    setBusy(true);
    try {
      const { res, data } = await post("/api/vote/verify-otp", { email, code: clean });
      if (res.status === 403 && data.state) return onClosedByServer();
      if (!res.ok) return setError(data.error || "رمز غير صحيح.");
      setVoteToken(data.voteToken);
      setInfo(null);
      setStep("confirm");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  };

  const cast = async () => {
    setError(null);
    setBusy(true);
    try {
      const { res, data } = await post("/api/vote/cast", { voteToken, teamId: team.id });
      if (res.status === 403 && data.state) return onClosedByServer();
      if (!res.ok) {
        if (data.tokenExpired) {
          setStep("info");
          return setError(data.error);
        }
        if (data.alreadyVoted) {
          setError(data.error);
          return;
        }
        return setError(data.error || "تعذر تسجيل الصوت.");
      }
      setDoneMessage(data.message);
      setStep("done");
      onVoted(team.teamName);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: "info", label: "بياناتك" },
    { key: "otp", label: "رمز التحقق" },
    { key: "confirm", label: "تأكيد الصوت" },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl text-[#001742]">
            {step === "done" ? "تم تسجيل صوتك" : "التصويت لفريق"}
          </DialogTitle>
          {step !== "done" && (
            <DialogDescription className="text-base font-semibold text-[#2F44DC]">{team.teamName}</DialogDescription>
          )}
        </DialogHeader>

        {step !== "done" && (
          <ol className="flex items-center gap-2 text-xs">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i < stepIndex ? "bg-emerald-500 text-white" : i === stepIndex ? "bg-[#2F44DC] text-white" : "bg-slate-200 text-slate-600"}`}>
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                <span className={i === stepIndex ? "font-semibold text-slate-900" : "text-slate-500"}>{s.label}</span>
                {i < steps.length - 1 && <ChevronLeft className="h-3 w-3 text-slate-300" />}
              </li>
            ))}
          </ol>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {info && !error && (
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" /> <span>{info}</span>
          </div>
        )}

        {step === "info" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              requestOtp();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-first">الاسم الأول</Label>
                <Input id="v-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} autoComplete="given-name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-last">اسم العائلة</Label>
                <Input id="v-last" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} autoComplete="family-name" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-email">البريد الإلكتروني</Label>
              <Input id="v-email" type="email" dir="ltr" className="text-left" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
              <p className="text-xs text-slate-500">سنرسل رمز تحقق من 6 أرقام إلى هذا البريد. صوت واحد فقط لكل بريد.</p>
            </div>
            <Button type="submit" className="w-full bg-[#2F44DC] hover:bg-[#2538b8]" disabled={busy}>
              {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Mail className="ml-2 h-4 w-4" />}
              إرسال رمز التحقق
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="v-code">رمز التحقق المرسل إلى <span dir="ltr" className="font-mono">{email.trim().toLowerCase()}</span></Label>
              <Input
                id="v-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                dir="ltr"
                className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
                placeholder="••••••"
                autoFocus
              />
              <p className="text-xs text-slate-500">الرمز صالح لمدة 10 دقائق. تحقق من مجلد الرسائل غير المرغوبة إن لم يصلك.</p>
            </div>
            <Button type="submit" className="w-full bg-[#2F44DC] hover:bg-[#2538b8]" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <KeyRound className="ml-2 h-4 w-4" />}
              تحقق من الرمز
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="text-slate-500 hover:underline" onClick={() => { setStep("info"); setError(null); setInfo(null); }}>
                تعديل البيانات
              </button>
              <button type="button" className="text-[#2F44DC] hover:underline disabled:text-slate-400 disabled:no-underline" disabled={busy || resendIn > 0} onClick={requestOtp}>
                {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ث` : "إعادة إرسال الرمز"}
              </button>
            </div>
          </form>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> تم التحقق من بريدك الإلكتروني بنجاح.
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">سيتم تسجيل صوتك لصالح</p>
              <p className="mt-1 text-xl font-bold text-[#001742]">{team.teamName}</p>
              {team.leaderName && <p className="mt-1 text-sm text-slate-600">قائد الفريق: {team.leaderName}</p>}
              <p className="mt-3 text-xs text-slate-500">
                باسم {firstName.trim()} {lastName.trim()} — <span dir="ltr" className="font-mono">{email.trim().toLowerCase()}</span>
              </p>
            </div>
            <p className="text-xs text-amber-700">لا يمكن تغيير الصوت أو التصويت مرة أخرى بعد التأكيد.</p>
            <Button className="w-full bg-[#2F44DC] hover:bg-[#2538b8]" disabled={busy} onClick={cast}>
              {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Vote className="ml-2 h-4 w-4" />}
              تأكيد التصويت
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-slate-900">{doneMessage}</p>
            <Button className="w-full" variant="outline" onClick={onClose}>إغلاق</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
