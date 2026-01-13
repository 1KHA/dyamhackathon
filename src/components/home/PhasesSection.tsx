"use client";
import { Card } from '@/components/ui/card';
import { FileText, Users, Presentation, Award, Code, Trophy } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

const PhasesSection = () => {
  const phases = [
    {
      number: 1,
      title: 'التسجيل والترشيح',
      description: 'فتح باب التسجيل للمشاركين في الهاكاثون.',
      date: '13 - 18 يناير',
      icon: FileText,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      number: 2,
      title: 'بدء الهاكاثون',
      description: 'بدء أعمال الهاكاثون.',
      date: '19 يناير - 12:00 م',
      icon: Code,
      color: 'from-teal-500 to-cyan-500'
    },
    {
      number: 3,
      title: 'ورشة العمل التقنية',
      description: 'التركيز على هياكل الرؤية الحاسوبية، استقاء البيانات، والإثراء.',
      date: '19 يناير - 1:00 م',
      icon: Presentation,
      color: 'from-green-500 to-emerald-500'
    },
    {
      number: 4,
      title: 'ورشة عمل الأعمال',
      description: 'التركيز على عرض الأفكار التقنية، والعائد على الاستثمار لإدارة النفايات، وريادة الأعمال.',
      date: '19 يناير - 2:00 م',
      icon: Users,
      color: 'from-purple-500 to-pink-500'
    },
    {
      number: 5,
      title: 'الموعد النهائي لتسليم الملفات',
      description: 'تسليم الروابط + شرائح العرض.',
      date: '20 يناير - 2:00 م',
      icon: Award,
      color: 'from-orange-500 to-red-500'
    },
    {
      number: 6,
      title: 'إعلان الفائزين',
      description: 'إعلان الفائزين في الهاكاثون.',
      date: '20 يناير - 6:00 م',
      icon: Trophy,
      color: 'from-yellow-500 to-orange-500'
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
    <section id="phases" className="py-20 relative" ref={sectionRef}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-orange arabic-text mb-6">
            الجدول الزمني
          </h2>
          <p className="text-xl text-muted-foreground arabic-text mb-8">
            جدول أعمال هاكاثون فيجنثون
          </p>
          <div className="w-24 h-1 bg-gradient-teal mx-auto mb-8"></div>
          <p className="text-lg text-muted-foreground arabic-text max-w-3xl mx-auto leading-relaxed">
            يمتد هاكاثون فيجنثون على مدار يومين مليئين بالتعلم والابتكار والتحدي، حيث يعمل المشاركون على تطوير حلول 
            الرؤية الحاسوبية لتصنيف النفايات باستخدام تقنيات الذكاء الاصطناعي المتقدمة.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Central Line */}
          <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-primary via-primary-glow to-primary opacity-30"></div>

          <div className="space-y-12">
            {phases.map((phase, index) => (
              <div key={index} className={`flex items-center ${index % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`w-full max-w-xl ${index % 2 === 0 ? 'text-right pr-20' : 'text-left pl-20'}`}>
                  <Card className={`bg-gradient-card border-border/50 hover-glow p-6 relative${isVisible ? ` ${index % 2 === 0 ? 'animate-slide-in-right' : 'animate-slide-in-left'}` : ''}`} style={isVisible ? { animationDelay: `${0.3 + index * 0.2}s` } : {}}>
                    {/* Phase Number Badge */}
                    <div className="absolute -top-4 left-4 w-8 h-8 bg-gradient-teal rounded-full flex items-center justify-center cosmic-glow">
                      <span className="text-primary-foreground font-bold text-sm">{phase.number}</span>
                    </div>

                    {/* Icon */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 bg-gradient-to-r ${phase.color} rounded-full flex items-center justify-center cosmic-glow`}>
                        <phase.icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-orange arabic-text">
                          {phase.title}
                        </h3>
                        <p className="text-sm text-orange font-semibold">
                          {phase.date}
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-muted-foreground arabic-text leading-relaxed">
                      {phase.description}
                    </p>

                    {/* Arrow pointing to timeline */}
                    <div className={`absolute top-1/2 transform -translate-y-1/2 ${
                      index % 2 === 0 
                        ? '-left-3 border-r-8 border-r-border border-y-8 border-y-transparent' 
                        : '-right-3 border-l-8 border-l-border border-y-8 border-y-transparent'
                    }`}></div>
                  </Card>
                </div>

                {/* Timeline Dot */}
                <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-primary rounded-full cosmic-glow z-10"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center mt-16">
          <Card className="bg-gradient-card border-border/50 cosmic-glow p-8 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-orange arabic-text mb-4">
              الجوائز
            </h3>
            <p className="text-muted-foreground arabic-text mb-6">
              المركز الأول: فرصة تدريب حقيقية للعمل في شركة ألفيرا، حزم مدفوعة للذكاء الاصطناعي، ومكافأة مالية رمزية مع التدريب
              <br />
              المركز الثاني: فرصة تدريب حقيقية للعمل في شركة ألفيرا، حزم مدفوعة للذكاء الاصطناعي
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default PhasesSection;
