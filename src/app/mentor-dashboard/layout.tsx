"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "../../../components/mentor/Sidebar";
import TopBar from "../../../components/mentor/TopBar";
import MentorRouteGuard from "@/components/auth/MentorRouteGuard";
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
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex">
          {/* Sidebar is fixed-positioned; hidden on mobile */}
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <main className="flex-1 min-w-0 w-full p-3 sm:p-4 md:p-6 md:mr-64 pb-20 md:pb-6">
            {children}
          </main>
        </div>
        <MobileNavigation />
      </div>
    </MentorRouteGuard>
  );
}
