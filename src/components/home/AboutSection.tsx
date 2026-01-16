"use client";
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Users, Lightbulb } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';

const AboutSection = () => {
  const features = [
    {
      icon: Brain,
      title: 'النفايات الحضرية (البلدية والمنزلية)',
      description: 'تحديد المواد المنزلية القابلة لإعادة التدوير (زجاجات البولي إيثيلين تيرفثالات، علب الألومنيوم، الكرتون، الزجاج)'
    },
    {
      icon: Users,
      title: 'النفايات الصناعية (النفايات الإلكترونية ومخلفات البناء) ',
      description: 'تحديد المواد الصناعية ذات القيمة العالية (لوحات الدوائر، الأسلاك النحاسية، الخرسانة، المعادن)'
    }
  ];
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section id="about" className="py-20 relative" ref={sectionRef}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className={`text-5xl md:text-6xl font-bold text-orange arabic-text mb-6${isVisible ? ' animate-fade-in-up' : ''}`}>
            مسارات التحدي
          </h2>
          <div className={`w-24 h-1 bg-gradient-teal mx-auto mb-8${isVisible ? ' animate-fade-in-up animation-delay-300' : ''}`}></div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, index) => {
            let delayClass = '';
            if (isVisible) {
              delayClass =
                index === 0
                  ? 'animate-fade-in-up animation-delay-500'
                  : index === 1
                  ? 'animate-fade-in-up animation-delay-700'
                  : 'animate-fade-in-up animation-delay-900';
            }
            return (
              <Card
                key={index}
                className={`bg-gradient-card border-border/50 hover-glow p-6 text-center${delayClass ? ' ' + delayClass : ''}`}
              >
                <div className="w-16 h-16 bg-gradient-teal rounded-full flex items-center justify-center mx-auto mb-4 cosmic-glow">
                  <feature.icon className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-bold text-orange arabic-text mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground arabic-text text-base leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="text-center mt-16">
          <Card className={`bg-gradient-card border-border/50 cosmic-glow p-8 max-w-2xl mx-auto${isVisible ? ' animate-fade-in-up animation-delay-1100' : ''}`}>
            <h3 className="text-3xl font-bold text-orange arabic-text mb-4">
              "الرؤية من خلال مستقبل الذكاء الاصطناعي في إدارة النفايات"
            </h3>
            <p className="text-xl text-muted-foreground arabic-text mb-6">
              انضم إلى تحدي فيجنثون واكتشف فرص التدريب  في شركة إلفيرا تك!
            </p>
            <Link href="/register-team">
              <Button className="bg-gradient-teal hover-glow arabic-text font-semibold px-8">
                ابدأ رحلتك الآن
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
