"use client";

import { useState, useEffect } from "react";
import Sidebar from "../../../components/participant/Sidebar";
import TopBar from "../../../components/participant/TopBar";
import ParticipantRouteGuard from "@/components/auth/ParticipantRouteGuard";
import { SidebarProvider, useSidebar } from "@/contexts/sidebar-context";
import { Home, Users, Flag, Award, Star, Book, Calendar, QrCode } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile navigation component
function MobileNavigation() {
  const pathname = usePathname();
  
  const navItems = [
    { name: "لوحة التحكم", href: "/participant-dashboard", icon: Home },
    { name: "فريقي", href: "/participant-dashboard/team", icon: Flag },
    { name: "الفرق", href: "/participant-dashboard/teams", icon: Users },
    { name: "التسليمات", href: "/participant-dashboard/milestones", icon: Star },
    { name: "الموجهون", href: "/participant-dashboard/mentors", icon: Book },
    { name: "الفعاليات", href: "/participant-dashboard/events", icon: Calendar },
    { name: "بطاقتي", href: "/participant-dashboard/badge", icon: QrCode },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t z-40 md:hidden shadow-lg">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`flex flex-col items-center py-2 px-1 ${
              pathname === item.href
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] sm:text-xs mt-1">{item.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Main content wrapper that responds to sidebar state
function MainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  
  return (
    <main 
      className={`flex-1 p-2 sm:p-4 md:p-6 transition-all duration-300 ease-in-out ${
        isCollapsed ? "md:mr-16" : "md:mr-64"
      } pb-20 md:pb-6`}
    >
      {children}
    </main>
  );
}

export default function ParticipantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    // Check if we're on a mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkMobile();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <ParticipantRouteGuard>
      <SidebarProvider>
        <div className="min-h-screen bg-background overflow-x-hidden">
          <TopBar />
          <div className="flex">
            {/* Sidebar is hidden on mobile */}
            <div className="hidden md:block">
              <Sidebar />
            </div>
            <MainContent>
              {children}
            </MainContent>
          </div>
          {/* Mobile bottom navigation */}
          <MobileNavigation />
        </div>
      </SidebarProvider>
    </ParticipantRouteGuard>
  );
}
