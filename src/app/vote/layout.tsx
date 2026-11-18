import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تصويت الجمهور",
  description: "صوّت لفريقك المفضل في المرحلة النهائية من مياهثون — صوت واحد لكل بريد إلكتروني.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "تصويت الجمهور | مياهثون",
    description: "صوّت لفريقك المفضل في المرحلة النهائية من مياهثون.",
    url: "https://dyamhackathon.vercel.app/vote",
  },
};

export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
