"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "../../../components/ui/use-toast";
import { Building2, Loader2, Save, User, Users } from "lucide-react";

type Mode = "individual" | "organization" | "both";

const OPTIONS: { value: Mode; title: string; body: string; icon: typeof User }[] = [
  {
    value: "individual",
    title: "الحجز مع موجه محدد",
    body: "يرى المشارك أسماء الموجهين ويحجز مع شخص بعينه. يصل الإشعار ورابط الاجتماع لذلك الموجه فقط (السلوك الحالي).",
    icon: User,
  },
  {
    value: "organization",
    title: "الحجز مع الجهة فقط",
    body: "يرى المشارك الجهات (بالشعار) دون أسماء الأشخاص، ويحجز مع الجهة. يصل الإشعار ورابط الاجتماع لجميع أعضاء الجهة.",
    icon: Building2,
  },
  {
    value: "both",
    title: "كلا الخيارين",
    body: "يستطيع المشارك الحجز مع جهة أو مع موجه محدد؛ كل مسار يعمل بسلوكه الخاص.",
    icon: Users,
  },
];

/** Admin control: how participants book mentors (TeamSettings.mentorBookingMode). */
export default function MentorBookingModeSettings() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("individual");
  const [saved, setSaved] = useState<Mode>("individual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/team-settings", { credentials: "include" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const m: Mode = ["individual", "organization", "both"].includes(data.mentorBookingMode) ? data.mentorBookingMode : "individual";
        setMode(m); setSaved(m);
      } catch {
        toast({ title: "خطأ", description: "فشل في جلب إعداد طريقة الحجز", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/admin/team-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mentorBookingMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setSaved(data.mentorBookingMode);
      toast({ title: "تم الحفظ", description: "تم تحديث طريقة حجز الموجهين" });
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> طريقة حجز الموجهين</CardTitle>
        <CardDescription>
          يتحكم هذا الإعداد فيما يراه المشاركون في صفحة الموجهين ومع من يستطيعون الحجز. الحالي:{" "}
          <Badge variant="secondary">{OPTIONS.find((o) => o.value === saved)?.title}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="radiogroup">
          {OPTIONS.map((o) => {
            const active = mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(o.value)}
                className={`text-right rounded-lg border p-4 transition-colors ${active ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <o.icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  {o.title}
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{o.body}</p>
              </button>
            );
          })}
        </div>
        <Button onClick={save} disabled={saving || mode === saved} className="w-full sm:w-auto">
          {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
          حفظ طريقة الحجز
        </Button>
      </CardContent>
    </Card>
  );
}
