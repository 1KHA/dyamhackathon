"use client";
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import AnimatedDigit from './AnimatedDigit';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Set target date to September 14, 2025
    const targetDate = new Date('2025-09-14T23:59:59');

    const updateCountdown = () => {
      const now = new Date();
      const distance = targetDate.getTime() - now.getTime();

      if (distance > 0) {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        setTimeLeft({
          days: Math.max(0, days),
          hours: Math.max(0, hours),
          minutes: Math.max(0, minutes),
          seconds: Math.max(0, seconds)
        });

      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    // Update immediately
    updateCountdown();

    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, []);

  const timeUnits = [
    { value: timeLeft.days, label: 'يوم' },
    { value: timeLeft.hours, label: 'ساعة' },
    { value: timeLeft.minutes, label: 'دقيقة' },
    { value: timeLeft.seconds, label: 'ثانية' }
  ];

  return (
    <div className="text-center mb-8">
      <h3 className={`text-lg arabic-text text-orange mb-6 transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}>
        الوقت المتبقي على إغلاق التسجيل
      </h3>
      <div className="flex justify-center gap-4 flex-wrap">
        {timeUnits.map((unit, index) => (
          <Card 
            key={index} 
            className={`bg-gradient-card border-border/50 transition-all duration-700 ease-out ${
              isVisible 
                ? 'opacity-100 translate-y-0 scale-100' 
                : 'opacity-0 translate-y-8 scale-95'
            }`}
            style={{ 
              transitionDelay: `${index * 150}ms` 
            }}
          >
            <div className="p-4 text-center min-w-[80px]">
              <div className="text-3xl font-bold text-primary mb-2 flex justify-center items-center gap-0">
                {unit.value.toString().padStart(2, '0').split('').reverse().map((digit, digitIndex) => (
                  <AnimatedDigit
                    key={`${index}-${digitIndex}`}
                    value={parseInt(digit)}
                    className="text-3xl font-bold text-primary"
                  />
                ))}
              </div>
              <div className="text-sm text-orange arabic-text">
                {unit.label}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CountdownTimer;
