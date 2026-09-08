"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "../../../components/mentor/Sidebar";
import TopBar from "../../../components/mentor/TopBar";
import MentorRouteGuard from "@/components/auth/MentorRouteGuard";
import { SidebarProvider, useSidebar } from "@/contexts/sidebar-context";
import { Home, User, CalendarClock, ListChecks, Bell } from "lucide-react";

// Bottom navigation for phones — the fixed sidebar is desktop-only.
function MobileNavigation() {
  const pathname = usePathname();

  const navItems = [
    { name: "الرئيسية", href: "/mentor-dashboard", icon: Home },
    { name: "الجلسات", href: "/mentor-dashboard/sessions", icon: ListChecks },
    { name: "التوفر", href: "/mentor-dashboard/availability", icon: CalendarClock },
    { name: "الإشعارات", href: "/mentor-dashboard/notifications", icon: Bell },
    { name: "الملف", href: "/mentor-dashboard/profile", icon: User },
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

// Content column whose right margin tracks the (fixed) sidebar's width.
function MainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  return (
    <main
      className={`flex-1 min-w-0 w-full p-3 sm:p-4 md:p-6 pb-20 md:pb-6 transition-all duration-300 ease-in-out ${
        isCollapsed ? "md:mr-16" : "md:mr-64"
      }`}
    >
      {children}
    </main>
  );
}

export default function MentorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <MentorRouteGuard>
      <SidebarProvider>
        <div className="min-h-screen bg-background">
          <TopBar />
          <div className="flex">
            {/* Sidebar is fixed-positioned; hidden on mobile */}
            <div className="hidden md:block">
              <Sidebar />
            </div>
            <MainContent>{children}</MainContent>
          </div>
          <MobileNavigation />
        </div>
      </SidebarProvider>
    </MentorRouteGuard>
  );
}
