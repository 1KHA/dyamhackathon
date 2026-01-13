import Navigation from '@/components/Navigation';
import HeroSection from '@/components/HeroSection';
import AboutSection from '@/components/AboutSection';
import PhasesSection from '@/components/PhasesSection';

const Index = () => {
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
          <p className="text-muted-foreground arabic-text">
            © 2025 هاكثون الابتكار لجائزة مايدة محيي الدين ناظر للابتكار - جميع الحقوق محفوظة
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
