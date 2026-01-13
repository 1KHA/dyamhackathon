"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { name: 'الرئيسية', href: '#home' },
    { name: 'عن الهاكاثون', href: '#about' },
    { name: 'المراحل', href: '#phases' },
    { name: 'الجوائز', href: '#prizes' },
    { name: 'التحديات', href: '#challenges' },
    { name: 'الشروط', href: '#terms' },
    { name: 'مراكز الهاكاثون', href: '#centers' },
    { name: 'تواصل معنا', href: '#contact' }
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Image 
              src="/hikma03.png" 
              alt="هاكاثون" 
              width={112}
              height={72}
              className="h-18 w-28"
            />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.name}
                variant="ghost"
                className="arabic-text text-sm hover:text-primary hover:bg-primary/10 transition-all duration-300"
                asChild
              >
                <a href={item.href}>{item.name}</a>
              </Button>
            ))}
          </div>

          {/* Registration Button */}
          <div className="hidden lg:block">
            <Link href="/register-team">
              <Button className="bg-gradient-teal hover-glow arabic-text font-bold text-lg px-6 py-3 rounded-lg">
                التسجيل الآن
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden hover:bg-primary/10"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden absolute top-16 left-0 right-0 bg-card/95 backdrop-blur-md border-b border-border">
            <div className="flex flex-col p-4 gap-2">
              {navItems.map((item) => (
                <Button
                  key={item.name}
                  variant="ghost"
                  className="arabic-text justify-start hover:text-primary hover:bg-primary/10"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <a href={item.href}>{item.name}</a>
                </Button>
              ))}
              <Link href="/register-team">
                <Button className="bg-gradient-teal hover-glow arabic-text font-semibold px-6 py-3 mt-4 w-full">
                  التسجيل الآن
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
