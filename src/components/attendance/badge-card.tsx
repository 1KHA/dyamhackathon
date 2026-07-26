"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface BadgeCardProps {
  fullName: string;
  teamName?: string | null;
  badgeCode: string;
}

/**
 * The digital badge — brand header, participant identity, QR code.
 * Wrapped in #print-badge so the @media print rules can isolate it.
 */
export default function BadgeCard({ fullName, teamName, badgeCode }: BadgeCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(badgeCode, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#1a2744", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => console.error("QR generation failed:", err));
    return () => {
      cancelled = true;
    };
  }, [badgeCode]);

  return (
    <div
      id="print-badge"
      className="mx-auto w-full max-w-sm rounded-2xl border-2 border-[#364F7A] bg-white shadow-lg overflow-hidden"
      dir="rtl"
    >
      <div className="bg-[#364F7A] text-white px-6 py-4 text-center">
        <div className="text-xl font-bold">منصة دِيَم</div>
        <div className="text-xs opacity-80 mt-1">بطاقة مشارك — الهاكاثون</div>
      </div>

      <div className="px-6 py-5 text-center space-y-1">
        <div className="text-lg font-bold text-gray-900">{fullName}</div>
        {teamName ? (
          <div className="text-sm text-gray-600">فريق: {teamName}</div>
        ) : (
          <div className="text-sm text-gray-600">مشارك فردي</div>
        )}
      </div>

      <div className="flex justify-center pb-2">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="رمز الحضور" className="w-56 h-56" />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center text-sm text-gray-400">
            جاري إنشاء الرمز...
          </div>
        )}
      </div>

      <div className="pb-5 text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-mono tracking-wider" dir="ltr">
          {badgeCode}
        </span>
      </div>

      <div className="bg-gray-50 border-t px-6 py-2 text-center text-[10px] text-gray-400">
        أبرِز هذه البطاقة للمشرف عند الدخول لتسجيل حضورك
      </div>
    </div>
  );
}
