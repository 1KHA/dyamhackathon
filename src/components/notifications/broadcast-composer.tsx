"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "../../../components/ui/use-toast";

interface PickerUser {
  id: string;
  type: "participant" | "mentor";
  name: string;
  email: string;
}

interface BroadcastRow {
  id: string;
  title: string;
  channels: string;
  audience: string;
  notificationCount: number;
  emailSentCount: number;
  emailFailedCount: number;
  createdAt: string;
}

type AudienceType = "all-participants" | "all-mentors" | "all-admins" | "selected";

const AUDIENCE_LABELS: Record<string, string> = {
  "all-participants": "جميع المشاركين",
  "all-mentors": "جميع المرشدين",
  "all-admins": "جميع المشرفين",
  selected: "مستخدمون محددون",
};

export default function BroadcastComposer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [channelDashboard, setChannelDashboard] = useState(true);
  const [channelEmail, setChannelEmail] = useState(false);
  const [audienceType, setAudienceType] = useState<AudienceType>("all-participants");
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const { toast } = useToast();

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/admin/broadcast", { credentials: "include" });
      if (res.ok) setHistory((await res.json()).broadcasts || []);
    } catch {
      /* history is non-critical */
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (audienceType !== "selected" || users.length > 0) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/users", { credentials: "include" });
        if (res.ok) setUsers((await res.json()).users || []);
      } catch {
        /* picker shows empty */
      }
    })();
  }, [audienceType, users.length]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  const toggleUser = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const send = async () => {
    try {
      setSending(true);
      const audience =
        audienceType === "selected"
          ? {
              type: "selected",
              selected: Array.from(selectedIds).map((key) => {
                const [type, id] = key.split(":");
                return { type, id };
              }),
            }
          : { type: audienceType };

      const channels = [
        ...(channelDashboard ? ["dashboard"] : []),
        ...(channelEmail ? ["email"] : []),
      ];

      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          body,
          emailSubject: emailSubject || title,
          channels,
          audience,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");

      const b = data.broadcast;
      toast({
        title: "تم الإرسال",
        description: `إشعارات: ${b.notificationCount} · بريد ناجح: ${b.emailSentCount} · بريد فاشل: ${b.emailFailedCount}`,
      });
      setTitle("");
      setBody("");
      setEmailSubject("");
      setSelectedIds(new Set());
      fetchHistory();
    } catch (err) {
      toast({
        title: "خطأ",
        description: err instanceof Error ? err.message : "فشل الإرسال",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const canSend =
    title.trim() &&
    body.trim() &&
    (channelDashboard || channelEmail) &&
    (audienceType !== "selected" || selectedIds.size > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إرسال رسالة جماعية</CardTitle>
          <CardDescription>
            أرسل إشعاراً في لوحة التحكم و/أو رسالة بريد إلكتروني لكل المستخدمين أو لمستخدمين
            محددين.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>العنوان</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>عنوان البريد (اختياري — الافتراضي هو العنوان)</Label>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>نص الرسالة</Label>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ch-dash"
                checked={channelDashboard}
                onCheckedChange={(v) => setChannelDashboard(v === true)}
              />
              <Label htmlFor="ch-dash">إشعار في لوحة التحكم</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ch-mail"
                checked={channelEmail}
                onCheckedChange={(v) => setChannelEmail(v === true)}
              />
              <Label htmlFor="ch-mail">بريد إلكتروني</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>الجمهور</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AUDIENCE_LABELS) as AudienceType[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={audienceType === t ? "default" : "outline"}
                  onClick={() => setAudienceType(t)}
                >
                  {AUDIENCE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>

          {audienceType === "selected" && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-10"
                  placeholder="ابحث بالاسم أو البريد..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground p-2">لا يوجد مستخدمون</p>
                ) : (
                  filteredUsers.map((u) => {
                    const key = `${u.type}:${u.id}`;
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selectedIds.has(key)}
                          onCheckedChange={() => toggleUser(key)}
                        />
                        <span className="font-medium">{u.name}</span>
                        <span className="text-muted-foreground" dir="ltr">
                          {u.email}
                        </span>
                        <span className="mr-auto px-1.5 py-0.5 rounded-full text-xs bg-muted">
                          {u.type === "participant" ? "مشارك" : "مرشد"}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                تم اختيار {selectedIds.size} مستخدم
              </p>
            </div>
          )}

          <Button
            onClick={send}
            disabled={!canSend || sending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="ml-2 h-4 w-4" />
            {sending ? "جاري الإرسال..." : "إرسال"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">سجل الرسائل المرسلة</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-center p-4 text-muted-foreground">لا توجد رسائل مرسلة بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 text-right">التاريخ</th>
                    <th className="border p-2 text-right">العنوان</th>
                    <th className="border p-2 text-right">الجمهور</th>
                    <th className="border p-2 text-right">القنوات</th>
                    <th className="border p-2 text-right">إشعارات</th>
                    <th className="border p-2 text-right">بريد ناجح</th>
                    <th className="border p-2 text-right">بريد فاشل</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b) => {
                    let audienceLabel = "-";
                    let channelsLabel = "-";
                    try {
                      const a = JSON.parse(b.audience);
                      audienceLabel =
                        a.type === "selected"
                          ? `${a.selected?.length ?? 0} مستخدم محدد`
                          : AUDIENCE_LABELS[a.type] || a.type;
                      channelsLabel = (JSON.parse(b.channels) as string[])
                        .map((c) => (c === "dashboard" ? "لوحة" : "بريد"))
                        .join(" + ");
                    } catch {
                      /* leave dashes */
                    }
                    return (
                      <tr key={b.id} className="hover:bg-muted/50">
                        <td className="border p-2 text-sm">
                          {new Date(b.createdAt).toLocaleDateString("ar-SA")}
                        </td>
                        <td className="border p-2 text-sm font-medium">{b.title}</td>
                        <td className="border p-2 text-sm">{audienceLabel}</td>
                        <td className="border p-2 text-sm">{channelsLabel}</td>
                        <td className="border p-2 text-sm text-center">{b.notificationCount}</td>
                        <td className="border p-2 text-sm text-center text-green-600">
                          {b.emailSentCount}
                        </td>
                        <td className="border p-2 text-sm text-center text-red-500">
                          {b.emailFailedCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
