"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "../../../components/hackathon-admin/AdminHacktonSidebar";
import TopBar from "@/components/hackathon-admin/TopBar";
import AdminRouteGuard from "@/components/auth/AdminRouteGuard";
import { Menu, X } from "lucide-react";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  if (!isMounted) {
    return null;
  }

  return (
    <AdminRouteGuard>
      <div className="min-h-screen bg-background">
        <TopBar />

        {/* Mobile-only menu bar (sidebar is hidden below md) */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-background px-3 py-2" dir="rtl">
          <button
            onClick={() => setIsMobileNavOpen(true)}
            className="rounded-md p-2 hover:bg-muted"
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">إدارة الهاكاثون</span>
        </div>

        {/* Mobile navigation drawer */}
        {isMobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden" dir="rtl">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsMobileNavOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 right-0 flex h-full w-64 max-w-[85vw]">
              <div className="h-full w-full overflow-y-auto bg-white dark:bg-gray-800 shadow-xl">
                <Sidebar />
              </div>
            </div>
            <button
              onClick={() => setIsMobileNavOpen(false)}
              className="absolute top-3 left-3 rounded-full bg-background p-2 shadow"
              aria-label="إغلاق القائمة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="flex">
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <main className="flex-1 min-w-0 w-full p-3 sm:p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminRouteGuard>
  );
}
