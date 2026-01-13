import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Users, Lightbulb, Target } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

const AboutSection = () => {
  const features = [
    {
      icon: Brain,
      title: 'إحياء اللغة العربية',
      description: 'بحلول رقمية مبتكرة'
    },
    {
      icon: Users,
      title: 'تحسين جودة الحياة',
      description: 'لكبار السن والمكفوفين'
    },
    {
      icon: Lightbulb,
      title: 'تعزيز كفاءة العاملين',
      description: 'في قطاع السياحة الدينية (الحج والعمرة)'
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
          <h2 className={`text-4xl md:text-5xl font-bold text-primary arabic-text mb-6${isVisible ? ' animate-fade-in-up' : ''}`}>
            مسارات التحدي
          </h2>
          <div className={`w-24 h-1 bg-gradient-teal mx-auto mb-8${isVisible ? ' animate-fade-in-up animation-delay-300' : ''}`}></div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <h4 className="text-lg font-bold text-foreground arabic-text mb-3">
                  {feature.title}
                </h4>
                <p className="text-muted-foreground arabic-text text-sm leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="text-center mt-16">
          <Card className={`bg-gradient-card border-border/50 cosmic-glow p-8 max-w-2xl mx-auto${isVisible ? ' animate-fade-in-up animation-delay-1100' : ''}`}>
            <h3 className="text-2xl font-bold text-primary arabic-text mb-4">
              انضم الآن إلى النسخة الثانية
            </h3>
            <p className="text-muted-foreground arabic-text mb-6">
              حيث يلتقي الإبداع بالتقنية لبناء مستقبل مشرق!
            </p>
            <Button className="bg-gradient-teal hover-glow arabic-text font-semibold px-8">
              ابدأ رحلتك الآن
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
