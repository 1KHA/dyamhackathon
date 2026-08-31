"use client";

import { useState, useEffect } from "react";
import Sidebar from "../../../components/hackathon-admin/AdminHacktonSidebar";
import TopBar from "@/components/hackathon-admin/TopBar";
import AdminRouteGuard from "@/components/auth/AdminRouteGuard";

export default function AdminDashboardLayout({
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
    <AdminRouteGuard>
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminRouteGuard>
  );
}
