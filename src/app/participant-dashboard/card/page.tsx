"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "../../../../components/ui/use-toast";
import { CHALLENGES } from "@/lib/challenges";
import { Contact, Download, ImagePlus, Loader2, Share2, Trash2, User, UserRound } from "lucide-react";

/**
 * "بطاقة المشارك" — a shareable card rendered in the browser on top of
 * public/card/basecard.png (8000×4500). Nothing is uploaded or stored: the
 * photo, name, team and track live in this page only, and the PNG is built
 * with a canvas and downloaded/shared from the device.
 *
 * Geometry below is measured on the base card (8000×4500 coordinate space)
 * and scaled to the canvas size at draw time.
 */
const BASE_W = 8000;
const BASE_H = 4500;
/** Output size: half of the artwork — 4000×2250 is plenty for social media. */
const SCALE = 0.5;

const CIRCLE = { cx: 1499, cy: 2067, r: 925 };
const PILL = { cx: 4698, cy: 1233, maxWidth: 2150 }; // pill body: x 3506–5891, y 1102–1364
const NAME = { cx: 1498, baseline: 3340, maxWidth: 2400, size: 260 }; // a bit lower/smaller than the sample: breathing room under the circle
const TEAM = { cx: 1498, baseline: 3560, maxWidth: 2400, size: 170, color: "#58A8D8" };
const FONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';

type Track = (typeof CHALLENGES)[number];
type Avatar = "male" | "female";

interface Me {
  fullName?: string;
  gender?: string;
  team?: { id: string; teamName: string; hackathonTrack?: string | null } | null;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`تعذر تحميل الصورة: ${src}`));
    img.src = src;
  });

/** Largest font size (≤ max) at which `text` fits in `maxWidth`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, maxWidth: number, min = 60): number {
  let size = max;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 6;
  }
  return size;
}

export default function ParticipantCardPage() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [track, setTrack] = useState<Track | "">("");
  const [avatar, setAvatar] = useState<Avatar>("male");
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const assets = useRef<{ base: HTMLImageElement; male: HTMLImageElement; female: HTMLImageElement } | null>(null);

  // ---- prefill from the participant profile --------------------------------
  useEffect(() => {
    (async () => {
      try {
        const [meRes, base, male, female] = await Promise.all([
          fetch("/api/participant/me", { credentials: "include" }),
          loadImage("/card/basecard.png"),
          loadImage("/card/male.png"),
          loadImage("/card/female.png"),
        ]);
        assets.current = { base, male, female };
        if (meRes.ok) {
          const me: Me = await meRes.json();
          setName((me.fullName && me.fullName !== "غير متوفر" ? me.fullName : "") || "");
          setTeamName(me.team?.teamName || "");
          const t = me.team?.hackathonTrack;
          if (t && (CHALLENGES as readonly string[]).includes(t)) setTrack(t as Track);
          setAvatar(/أنثى|انثى|female/i.test(me.gender || "") ? "female" : "male");
        }
        // Make sure the card font is in memory before the first draw.
        await Promise.all([700, 600].map((w) => document.fonts.load(`${w} 100px "IBM Plex Sans Arabic"`)));
      } catch (e) {
        toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر تحميل بيانات البطاقة", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- draw ------------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const a = assets.current;
    if (!canvas || !a) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = BASE_W * SCALE;
    canvas.height = BASE_H * SCALE;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); // draw in base-card coordinates
    ctx.drawImage(a.base, 0, 0, BASE_W, BASE_H);

    // Photo / default avatar, clipped to the white circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(CIRCLE.cx, CIRCLE.cy, CIRCLE.r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const d = CIRCLE.r * 2;
    if (photo) {
      // cover-fit, centred
      const s = Math.max(d / photo.width, d / photo.height);
      const w = photo.width * s, h = photo.height * s;
      ctx.drawImage(photo, CIRCLE.cx - w / 2, CIRCLE.cy - h / 2, w, h);
    } else {
      // silhouette: ~80% of the circle width, sitting on the circle's bottom edge
      const img = avatar === "female" ? a.female : a.male;
      const w = d * 0.8, h = (img.height / img.width) * w;
      ctx.drawImage(img, CIRCLE.cx - w / 2, CIRCLE.cy + CIRCLE.r - h, w, h);
    }
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.direction = "rtl";

    // Track — inside the gradient pill
    const trackText = track ? `مسار | ${track}` : "";
    if (trackText) {
      const size = fitFont(ctx, trackText, 700, 190, PILL.maxWidth);
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(trackText, PILL.cx, PILL.cy + size * 0.36);
    }

    // Full name — white, under the circle
    const nameText = name.trim();
    if (nameText) {
      const size = fitFont(ctx, nameText, 700, NAME.size, NAME.maxWidth);
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(nameText, NAME.cx, NAME.baseline);
    }

    // Team name — light blue, under the name
    const teamText = teamName.trim();
    if (teamText) {
      const size = fitFont(ctx, teamText, 600, TEAM.size, TEAM.maxWidth);
      ctx.font = `600 ${size}px ${FONT}`;
      ctx.fillStyle = TEAM.color;
      ctx.fillText(teamText, TEAM.cx, TEAM.baseline);
    }
  }, [name, teamName, track, avatar, photo]);

  useEffect(() => { if (!loading) draw(); }, [loading, draw]);

  // ---- photo pick --------------------------------------------------------------
  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "ملف غير مقبول", description: "الرجاء اختيار صورة (JPG أو PNG)", variant: "destructive" }); return; }
    if (file.size > 15 * 1024 * 1024) { toast({ title: "ملف كبير", description: "حجم الصورة يجب أن يكون أقل من 15 ميجابايت", variant: "destructive" }); return; }
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      setPhoto(img);
      setPhotoName(file.name);
    } catch {
      toast({ title: "خطأ", description: "تعذر قراءة الصورة", variant: "destructive" });
    }
  };

  // ---- export --------------------------------------------------------------------
  const toBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      const c = canvasRef.current;
      if (!c) return reject(new Error("no canvas"));
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
  const fileName = () => `miyahthon-card-${(name.trim() || "participant").replace(/[\\/:*?"<>|]+/g, "").slice(0, 40)}.png`;

  const download = async () => {
    try {
      setRendering(true);
      draw();
      const blob = await toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName(); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر إنشاء الصورة", variant: "destructive" });
    } finally {
      setRendering(false);
    }
  };

  const share = async () => {
    try {
      draw();
      const blob = await toBlob();
      const file = new File([blob], fileName(), { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "بطاقة المشارك — مياهثون", text: "#سفير_مياهثون" });
      } else {
        await download();
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast({ title: "خطأ", description: "تعذرت المشاركة، تم تنزيل الصورة بدلاً من ذلك", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] gap-2 text-muted-foreground" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" /> جاري تحضير البطاقة...
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-800 flex items-center gap-2">
          <Contact className="h-7 w-7" /> أنا مشارك
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          صمّم بطاقتك وشاركها على وسائل التواصل بوسم <span className="font-semibold">#سفير_مياهثون</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="border-0 shadow-sm lg:order-2">
          <CardHeader className="pb-3"><CardTitle className="text-lg">بيانات البطاقة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="card-name">الاسم الكامل (بالعربية)</Label>
              <Input id="card-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم كما تريد ظهوره على البطاقة" maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="card-team">اسم الفريق</Label>
              <Input id="card-team" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="اسم فريقك" maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label>المسار</Label>
              <Select value={track} onValueChange={(v) => setTrack(v as Track)}>
                <SelectTrigger><SelectValue placeholder="اختر المسار..." /></SelectTrigger>
                <SelectContent dir="rtl" className="text-right">
                  {CHALLENGES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-photo">صورتك (اختياري)</Label>
              <div className="flex items-center gap-2">
                <Input id="card-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onPickPhoto(e.target.files?.[0] || null)} className="flex-1" />
                {photo && (
                  <Button type="button" variant="ghost" size="icon" title="إزالة الصورة" onClick={() => { setPhoto(null); setPhotoName(null); const el = document.getElementById("card-photo") as HTMLInputElement | null; if (el) el.value = ""; }}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{photoName ? `الصورة المختارة: ${photoName}` : "تُقصّ الصورة تلقائياً داخل الدائرة. تُعالج على جهازك ولا تُرفع إلى المنصة."}</p>
              {!photo && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">الصورة الافتراضية</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={avatar === "male" ? "default" : "outline"} onClick={() => setAvatar("male")} className="gap-1"><User className="h-4 w-4" /> ذكر</Button>
                    <Button type="button" size="sm" variant={avatar === "female" ? "default" : "outline"} onClick={() => setAvatar("female")} className="gap-1"><UserRound className="h-4 w-4" /> أنثى</Button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button onClick={download} disabled={rendering} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700">
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل البطاقة (PNG)
              </Button>
              <Button onClick={share} variant="outline" className="flex-1 gap-2"><Share2 className="h-4 w-4" /> مشاركة</Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="border-0 shadow-sm lg:col-span-2 lg:order-1 overflow-hidden">
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><ImagePlus className="h-5 w-5 text-blue-600" /> معاينة البطاقة</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg overflow-hidden shadow-md bg-[#0a1a5c]">
              <canvas ref={canvasRef} className="w-full h-auto block" aria-label="معاينة بطاقة المشارك" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
