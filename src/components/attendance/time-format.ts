/** "13:05" in Riyadh time (empty for null). */
export const formatTime = (iso: string | Date | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })
    : "—";

/** 75 -> "1 س 15 د", 40 -> "40 د" (spaces keep digits and letters in order in RTL text). */
export const formatMinutes = (m: number | null | undefined) => {
  if (m === null || m === undefined) return "—";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} س${r ? ` ${r} د` : ""}` : `${r} د`;
};

/** "من 13:00 إلى 13:20" — unambiguous in RTL text. */
export const formatRange = (start: string | Date, end: string | Date) => `من ${formatTime(start)} إلى ${formatTime(end)}`;
