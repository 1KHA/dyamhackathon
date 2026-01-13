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
      "name": "هاكاثون فيجنثون VISIONTHON",
      "description": "هاكاثون فيجنثون VISIONTHON",
      "organizer": {
        "@type": "Organization",
        "name": "هاكاثون فيجنثون VISIONTHON",
        "url": "https://visionthon.dyam.dev"
      },
      "location": {
        "@type": "Place",
        "name": "هاكاثون فيجنثون VISIONTHON",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "جدة",
          "addressCountry": "SA"
        }
      },
      "keywords": [
        "هاكاثون فيجنثون VISIONTHON"
      ],
      "eventStatus": "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "url": "https://visionthon.dyam.dev/"
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(structuredData);
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove the script when component unmounts
      const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(s => {
        if (s.textContent?.includes('هاكاثون فيجنثون VISIONTHON')) {
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
        <h1>هاكاثون فيجنثون VISIONTHON</h1>
        <h2>هاكاثون متخصص في الرؤية الحاسوبية والذكاء الاصطناعي</h2>
        <p>
          هاكاثون فيجنثون VISIONTHON
        </p>
        <p>
          هاكاثون متخصص في الرؤية الحاسوبية (Computer Vision) والشبكات العصبية الالتفافية (CNN) ومحولات الرؤية (Vision Transformers) ونماذج اللغة والرؤية (Vision Language Models).
          يهدف إلى استكشاف المواهب وتوظيفها لبرنامج تدريب مدفوع الأجر، وعمل نماذج أولية لحلول الرؤية الحاسوبية لتصنيف النفايات.
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
