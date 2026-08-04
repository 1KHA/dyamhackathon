import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/../../components/ui/toaster";
import { AuthProvider } from "@/contexts/auth-context";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL('https://visionthon.dyam.dev'),
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false
  },
  title: {
    default: "miyahthone",
    template: "%s | miyahthone",
  },
  description: "تحدي فيجنثون VISIONTHON - تحدي يجمع طلبة وخريجي الجامعات لتشجيع الابتكار وتطوير حلول مستدامة في مجال الرؤية الحاسوبية والذكاء الاصطناعي لتصنيف النفايات.",
  keywords: [
    "تحدي فيجنثون VISIONTHON"
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
    title: "miyahthone",
    description: "تحدي فيجنثون VISIONTHON - تحدي يجمع طلبة وخريجي الجامعات لتشجيع الابتكار وتطوير حلول مستدامة في مجال الرؤية الحاسوبية والذكاء الاصطناعي لتصنيف النفايات.",
    url: "https://visionthon.dyam.dev/",
    siteName: "miyahthone",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "تحدي فيجنثون VISIONTHON"
      }
    ],
    locale: "ar_SA",
    type: "website"
  },
  icons: {
    icon: "/favicon.png",
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
      <body>
        <AuthProvider>
          {children}
          <Toaster />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
