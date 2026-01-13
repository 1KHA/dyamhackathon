import { useEffect, useState } from 'react';

interface AnimatedDigitProps {
  value: number;
  className?: string;
}

const AnimatedDigit = ({ value, className = '' }: AnimatedDigitProps) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (value !== displayValue) {
      const timeout = setTimeout(() => {
        setDisplayValue(value);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [value, displayValue]);

  // Create array of digits 0-9 for the odometer effect
  const digits = Array.from({ length: 10 }, (_, i) => i);
  
  return (
    <div className="relative overflow-hidden inline-block bg-transparent" style={{ height: '48px', width: '18px' }}>
      <div
        className="transition-transform duration-500 ease-in-out"
        style={{
          transform: `translateY(-${displayValue * 48}px)`,
        }}
      >
        {digits.map((digit) => (
          <div
            key={digit}
            className={`flex items-center justify-center ${className}`}
            style={{ height: '48px', lineHeight: '48px' }}
          >
            {digit}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnimatedDigit;
