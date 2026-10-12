"use client";

import { Clock, Phone, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes, formatRange, formatTime } from "./time-format";

export interface ParticipantDetails {
  participant: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isLeader: boolean;
    gender: string | null;
    city: string | null;
    nationality: string | null;
    residence: string | null;
    university: string | null;
    major: string | null;
    education: string | null;
    professionalField: string | null;
    employmentStatus: string | null;
    status: string;
    isDisabled: boolean;
    phase: string | null;
  };
  team: null | {
    id: string;
    name: string | null;
    status: string;
    isDisabled: boolean;
    track: string | null;
    ideaName: string | null;
    phase: string | null;
    members: { id: string; name: string; email: string; phone: string | null; isLeader: boolean }[];
  };
  bookings: {
    id: string;
    startTime: string;
    endTime: string;
    mentorName: string;
    mentorOrganization: string | null;
    bookedThroughOrganization: string | null;
    bookedBy: string;
    upcoming: boolean;
  }[];
  venueToday: {
    date: string;
    summary: { state: "inside" | "outside" | "none"; firstIn: string | null; lastOut: string | null; insideSince: string | null; insideMinutes: number; outsideMinutes: number; exits: number };
    scans: { direction: string; at: string; byName?: string }[];
  };
}

const Field = ({ label, value }: { label: string; value: string | null | undefined }) =>
  value ? (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  ) : null;

/** Read-only participant card for organizers: person, today's entries/exits, team, members, bookings. */
export default function ParticipantDetailsPanel({ details, onClose }: { details: ParticipantDetails; onClose?: () => void }) {
  const { participant: p, team, bookings, venueToday } = details;
  const s = venueToday.summary;
  const now = Date.now();

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-blue-600" />
            {p.name}
            {p.isLeader && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">قائد الفريق</span>}
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="إغلاق">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* person */}
        <div className="grid gap-1 sm:grid-cols-2">
          <div className="text-sm" dir="ltr" style={{ textAlign: "right" }}>{p.email}</div>
          {p.phone && (
            <div className="flex items-center gap-1 text-sm">
              <Phone className="h-3 w-3" />
              <a href={`tel:${p.phone}`} dir="ltr" className="underline">{p.phone}</a>
            </div>
          )}
          <Field label="الجنس" value={p.gender} />
          <Field label="المدينة" value={p.city} />
          <Field label="الجنسية" value={p.nationality} />
          <Field label="مكان الإقامة" value={p.residence} />
          <Field label="الجامعة" value={p.university} />
          <Field label="التخصص" value={p.major} />
          <Field label="المؤهل" value={p.education} />
          <Field label="المجال المهني" value={p.professionalField} />
          <Field label="الحالة الوظيفية" value={p.employmentStatus} />
          {!team && <Field label="المرحلة" value={p.phase} />}
        </div>
        {p.isDisabled && <div className="rounded bg-red-50 p-2 text-sm text-red-700">هذا الحساب معطل.</div>}

        {/* today's venue entries / exits */}
        <div className="rounded-md border p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" /> الدخول والخروج اليوم (<span dir="ltr">{venueToday.date}</span>)
          </div>
          {s.state === "none" ? (
            <p className="text-sm text-muted-foreground">لم يُسجَّل دخوله اليوم.</p>
          ) : (
            <>
              <p className="text-sm">
                {s.state === "inside" ? (
                  <span className="font-semibold text-green-700">داخل الآن منذ {formatTime(s.insideSince)}</span>
                ) : (
                  <span className="font-semibold text-red-700">خرج الساعة {formatTime(s.lastOut)}</span>
                )}
                {" — "}أول دخول {formatTime(s.firstIn)} · مدة التواجد {formatMinutes(s.insideMinutes)} · خرج {s.exits} مرة
                {s.outsideMinutes > 0 ? ` · وقت الخروج ${formatMinutes(s.outsideMinutes)}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {venueToday.scans.map((x, i) => (
                  <span key={i} className={`rounded px-1.5 py-0.5 text-xs ${x.direction === "in" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {x.direction === "in" ? "دخول" : "خروج"} {formatTime(x.at)}
                    {x.byName ? ` · ${x.byName}` : ""}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* team */}
        {team ? (
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4" /> فريق {team.name || "بدون اسم"}
              {team.isDisabled && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">معطل</span>}
            </div>
            <div className="mb-2 grid gap-1 sm:grid-cols-2">
              <Field label="المسار" value={team.track} />
              <Field label="الفكرة" value={team.ideaName} />
              <Field label="المرحلة" value={team.phase} />
            </div>
            {/* phones: one block per member, nothing cut off */}
            <div className="space-y-2 sm:hidden">
              {team.members.map((m) => (
                <div key={m.id} className={`rounded-md border p-2 text-sm ${m.id === p.id ? "border-blue-300 bg-blue-50" : "bg-white"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {m.name}
                      {m.isLeader && <span className="mr-1 text-xs text-blue-700">(قائد)</span>}
                    </span>
                    {m.phone && (
                      <a href={`tel:${m.phone}`} dir="ltr" className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-xs text-blue-700">
                        <Phone className="h-3 w-3" />
                        {m.phone}
                      </a>
                    )}
                  </div>
                  <div className="mt-0.5 break-all text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                    {m.email}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border p-1.5 text-right">العضو</th>
                    <th className="border p-1.5 text-right">الجوال</th>
                    <th className="border p-1.5 text-right">البريد</th>
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((m) => (
                    <tr key={m.id} className={m.id === p.id ? "bg-blue-50" : ""}>
                      <td className="border p-1.5">
                        {m.name}
                        {m.isLeader && <span className="mr-1 text-xs text-blue-700">(قائد)</span>}
                      </td>
                      <td className="border p-1.5" dir="ltr">{m.phone ? <a href={`tel:${m.phone}`} className="underline">{m.phone}</a> : "—"}</td>
                      <td className="border p-1.5" dir="ltr">{m.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">مشارك فردي (بدون فريق).</p>
        )}

        {/* bookings */}
        <div className="rounded-md border p-3">
          <div className="mb-2 font-semibold">جلسات الإرشاد {team ? "للفريق" : ""}</div>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد حجوزات.</p>
          ) : (
            <div className="space-y-1">
              {bookings.map((b) => {
                const isNow = new Date(b.startTime).getTime() <= now && now < new Date(b.endTime).getTime();
                return (
                  <div
                    key={b.id}
                    className={`flex flex-wrap items-center gap-2 rounded p-2 text-sm ${
                      isNow ? "bg-green-50 ring-1 ring-green-400" : b.upcoming ? "bg-blue-50/60" : "text-muted-foreground line-through decoration-gray-300"
                    }`}
                  >
                    <span className="font-semibold">
                      {new Date(b.startTime).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short" })}{" "}
                      {formatRange(b.startTime, b.endTime)}
                    </span>
                    {isNow && <span className="rounded bg-green-600 px-1.5 py-0.5 text-xs text-white">الآن</span>}
                    <span>
                      مع <span className="font-medium">{b.mentorName}</span>
                      {b.mentorOrganization ? ` (${b.mentorOrganization})` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">حجز: {b.bookedBy}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
