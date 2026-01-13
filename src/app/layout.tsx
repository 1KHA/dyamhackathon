import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/../../components/ui/toaster";
import { AuthProvider } from "@/contexts/auth-context";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://visionthon.dyam.dev'),
  title: "هاكاثون فيجنثون VISIONTHON",
  description: "هاكاثون فيجنثون VISIONTHON - تحدي يجمع طلبة الجامعات لتشجيع الابتكار وتطوير حلول مستدامة في مجال الرؤية الحاسوبية والذكاء الاصطناعي لتصنيف النفايات.",
  keywords: [
    "هاكاثون فيجنثون VISIONTHON"
  ],
  authors: [{ name: "جامعة دار الحكمة" }],
  creator: "جامعة دار الحكمة",
  publisher: "جامعة دار الحكمة",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: "هاكاثون فيجنثون VISIONTHON",
    description: "هاكاثون فيجنثون VISIONTHON - تحدي يجمع طلبة الجامعات لتشجيع الابتكار وتطوير حلول مستدامة في مجال الرؤية الحاسوبية والذكاء الاصطناعي لتصنيف النفايات.",
    url: "https://visionthon.dyam.dev/",
    siteName: "هاكاثون فيجنثون VISIONTHON",
    images: [
      {
        url: "/alvira.png",
        width: 1200,
        height: 630,
        alt: "هاكاثون فيجنثون VISIONTHON"
      }
    ],
    locale: "ar_SA",
    type: "website"
  },
  icons: {
    icon: "/alvira.png",
  },
  alternates: {
    canonical: "https://visionthon.dyam.dev/",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
