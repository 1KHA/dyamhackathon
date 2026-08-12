import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/../../components/ui/toaster";
import { AuthProvider } from "@/contexts/auth-context";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL('https://dyamhackathon.vercel.app'),
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false
  },
  title: {
    default: "مياهثون",
    template: "%s | مياهثون",
  },
  description: "مياهثون - هاكاثون يجمع طلبة وخريجي الجامعات لتشجيع الابتكار وتطوير حلول تقنية مستدامة في قطاع المياه.",
  keywords: [
    "مياهثون",
    "هاكاثون المياه",
    "miyahthone"
  ],
  authors: [{ name: "مياهثون" }],
  creator: "مياهثون",
  publisher: "مياهثون",
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
    title: "مياهثون",
    description: "مياهثون - هاكاثون يجمع طلبة وخريجي الجامعات لتشجيع الابتكار وتطوير حلول تقنية مستدامة في قطاع المياه.",
    url: "https://dyamhackathon.vercel.app/",
    siteName: "مياهثون",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "مياهثون"
      }
    ],
    locale: "ar_SA",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "مياهثون",
    description: "مياهثون - هاكاثون يجمع طلبة وخريجي الجامعات لتشجيع الابتكار وتطوير حلول تقنية مستدامة في قطاع المياه.",
    images: ["/logo.png"],
  },
  icons: {
    icon: "/favicon.png",
  },
  alternates: {
    canonical: "https://dyamhackathon.vercel.app/",
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
