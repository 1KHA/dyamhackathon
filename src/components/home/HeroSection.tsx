"use client";
import { Button } from '@/components/ui/button';
import CountdownTimer from './CountdownTimer';
import { ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const HeroSection = () => {
  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    // Start countdown animation after hero animations complete
    // The last hero animation has delay-1100 + 600ms duration = ~1700ms total
    const timer = setTimeout(() => {
      setShowCountdown(true);
    }, 1800); // Adding small buffer

    return () => clearTimeout(timer);
  }, []);

  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center pt-16">
      {/* Animated Stars Background */}
      <div className="stars"></div>
      
      {/* Floating Elements */}
      <div className="absolute top-20 right-10 w-2 h-2 bg-orange rounded-full animate-pulse-glow"></div>
      <div className="absolute top-32 left-20 w-1 h-1 bg-primary-glow rounded-full animate-pulse-glow delay-500"></div>
      <div className="absolute bottom-32 right-32 w-3 h-3 bg-orange rounded-full animate-pulse-glow delay-1000"></div>
      
      <div className="container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Main Title */}
          <div className="mb-6 animate-fade-in-up">
            <h1 className="text-4xl md:text-6xl font-black text-orange arabic-text mb-4 leading-tight transform transition-all duration-1000 ease-out">
              هاكاثون فيجنثون "VISIONTHON"
            </h1>
            <div className="mb-6 animate-fade-in-up animation-delay-300">
              <h2 className="text-xl md:text-2xl font-bold text-foreground arabic-text transform transition-all duration-800 ease-out">
                برعاية إلفيرا تك و وادي مكة
              </h2>
            </div>
            <p className="text-lg text-orange font-semibold arabic-text mb-8 animate-fade-in-up animation-delay-500 transform transition-all duration-700 ease-out">
              13 - 17 يناير 2026
            </p>
          </div>

          {/* Countdown Timer */}
          <div className="animate-fade-in-up animation-delay-700">
            {showCountdown ? <CountdownTimer /> : <div style={{ height: '200px' }} />}
          </div>

          {/* Registration Button */}
          <div className="mb-12 animate-fade-in-up animation-delay-900">
            <Link href="/register-team">
              <Button 
                size="lg" 
                className="bg-gradient-teal hover-glow arabic-text font-bold text-lg px-8 py-6 rounded-lg transform transition-all duration-500 ease-out hover:scale-105 hover:shadow-lg"
              >
                <ArrowLeft className="w-5 h-5 mr-2 transition-transform duration-300 group-hover:translate-x-1" />
                التسجيل الآن
              </Button>
            </Link>
          </div>

          {/* Description */}
          <div className="max-w-3xl mx-auto animate-fade-in-up animation-delay-1100">
            <p className="text-lg text-muted-foreground arabic-text leading-relaxed transform transition-all duration-600 ease-out">
              هاكاثون متخصص في الرؤية الحاسوبية (Computer Vision) والشبكات العصبية الالتفافية (CNN) ومحولات الرؤية (Vision Transformers) ونماذج اللغة والرؤية (Vision Language Models). 
              يهدف إلى استكشاف المواهب وتوظيفها لبرنامج تدريب مدفوع الأجر، وعمل نماذج أولية لحلول الرؤية الحاسوبية لتصنيف النفايات.
            </p>
          </div>
        </div>
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/40 pointer-events-none"></div>
    </section>
  );
};

export default HeroSection;
