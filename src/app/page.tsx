"use client";
import { useEffect } from "react";
import Image from "next/image";
import Navigation from "@/components/home/Navigation";
import HeroSection from "@/components/home/HeroSection";
import AboutSection from "@/components/home/AboutSection";
import PhasesSection from "@/components/home/PhasesSection";

export default function HomePage() {
  // Add structured data for SEO
  useEffect(() => {
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": "مياهثون",
      "description": "مبادرة تستعرض التحديات والفرص في قطاع المياه لاستقطاب أبرز الحلول الابتكارية",
      "organizer": {
        "@type": "Organization",
        "name": "مياهثون",
        "url": "https://dyamhackathon.vercel.app"
      },
      "location": {
        "@type": "Place",
        "name": "مياهثون",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "جدة",
          "addressCountry": "SA"
        }
      },
      "keywords": [
        "مياهثون",
        "هاكاثون المياه"
      ],
      "eventStatus": "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "url": "https://dyamhackathon.vercel.app/"
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove the script when component unmounts
      const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(s => {
        if (s.textContent?.includes('مياهثون')) {
          document.head.removeChild(s);
        }
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-cosmic">


      <Navigation />
      <main>
        <HeroSection />
        <AboutSection />
        <PhasesSection />
      </main>
      
      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center mb-6">
            <Image 
              src="/wadi.png" 
              alt="وادي مكة" 
              width={150} 
              height={60} 
              className="mx-auto"
            />
          </div>
          <p className="text-lg text-muted-foreground arabic-text mb-2">
            © 2026 مياهثون - جميع الحقوق محفوظة
          </p>
          <p className="text-lg text-muted-foreground">
            hackathon@elvirasa.com
          </p>
        </div>
      </footer>
    </div>
  );
}
