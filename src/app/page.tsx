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
      "name": "جائزة مايدة محي الدين ناظر للابتكار 3",
      "description": "تحدي يجمع طلبة الجامعات لاستكشاف وتوظيف الابتكارات الجامعية، توفر جائزة مايـدة محي الديـــن ناظـــر للابتكــــار هاكاثون الابتكار فرصة للعمل ضمن فرق تنافسية على تطوير حلول مبتكرة تسهم في تعزيز الاستدامة وجودة الحيـاة",
      "organizer": {
        "@type": "Organization",
        "name": "جامعة دار الحكمة",
        "url": "https://dah.edu.sa"
      },
      "location": {
        "@type": "Place",
        "name": "جامعة دار الحكمة",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "جدة",
          "addressCountry": "SA"
        }
      },
      "keywords": [
        "جائزة مايدة محي الدين ناظر للابتكار 3",
        "جائزة مايدة محي الدين ناظر للابتكار",
        "جائزة مايدة",
        "هاكاثون الابتكار",
        "دار الحكمة",
        "جامعة دار الحكمة",
        "تحدي يجمع طلبة الجامعات لاستكشاف وتوظيف الابتكارات الجامعية",
        "الاستدامة",
        "جودة الحياة"
      ],
      "eventStatus": "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "url": "https://dar-alhekma.dyam.dev/"
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove the script when component unmounts
      const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(s => {
        if (s.textContent?.includes('جائزة مايدة محي الدين ناظر للابتكار 3')) {
          document.head.removeChild(s);
        }
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-cosmic">
      {/* SEO Content - Hidden but readable by search engines */}
      <div style={{ 
        position: "absolute", 
        left: "-9999px", 
        width: "1px", 
        height: "1px", 
        overflow: "hidden" 
      }}>
        <h1>جائزة مايدة محي الدين ناظر للابتكار 3</h1>
        <h2>هاكاثون الابتكار في جامعة دار الحكمة</h2>
        <p>
          تحدي يجمع طلبة الجامعات لاستكشاف وتوظيف الابتكارات الجامعية، توفر جائزة مايـدة محي الديـــن ناظـــر للابتكــــار 
          هاكاثون الابتكار فرصة للعمل ضمن فرق تنافسية على تطوير حلول مبتكرة تسهم في تعزيز الاستدامة وجودة الحيـاة 
          في جامعة دار الحكمة. انضم إلى هاكاثون الابتكار واكتشف قدراتك في الابتكار والتطوير.
        </p>
        <p>
          دار الحكمة تستضيف جائزة مايدة محي الدين ناظر للابتكار 3، حيث يلتقي الطلاب المبدعون من مختلف الجامعات 
          للمشاركة في تحدي الابتكار وتطوير حلول مستدامة تخدم المجتمع وتحسن جودة الحياة.
        </p>
      </div>

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
          <p className="text-muted-foreground arabic-text mb-2">
            © 2026 هاكاثون فيجنثون "VISIONTHON" - جميع الحقوق محفوظة
          </p>
          <p className="text-muted-foreground">
            hackathon@elvirasa.com
          </p>
        </div>
      </footer>
    </div>
  );
}
