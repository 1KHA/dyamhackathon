"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Search,
  Menu,
  X,
  User,
  LogOut,
  Settings,
  HelpCircle,
  Home,
  ListChecks,
  CalendarClock,
  Bell,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationDropdown from "@/components/ui/notification-dropdown";
import { useAuth } from "@/contexts/auth-context";

const MOBILE_NAV_ITEMS = [
  { name: "لوحة التحكم", href: "/mentor-dashboard", icon: Home },
  { name: "جلسات الإرشاد", href: "/mentor-dashboard/sessions", icon: ListChecks },
  { name: "إدارة التوفر", href: "/mentor-dashboard/availability", icon: CalendarClock },
  { name: "الإشعارات", href: "/mentor-dashboard/notifications", icon: Bell },
  { name: "الملف الشخصي", href: "/mentor-dashboard/profile", icon: User },
];

export default function TopBar() {
  const { logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Handle search functionality
      setSearchQuery("");
    }
  };

  const handleLogout = async () => {
    // Must go through the auth context: it calls /api/logout to clear the
    // httpOnly cookie server-side, clears localStorage and resets user state.
    // Previously this just did `window.location.href = "/"`, which left the
    // session cookie intact — so /login saw a valid mentor session and
    // immediately redirected straight back into the mentor dashboard.
    await logout();
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-[#2F44DC] text-primary-foreground">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="mr-2 rounded-md p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 md:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
            <span className="sr-only">القائمة</span>
          </button>

          <Link href="/mentor-dashboard" className="flex items-center">
            <Image src="/logo2.png" alt="miyahthone" width={120} height={40} className="h-7 w-auto" />
            <span className="ml-1 rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-medium">
              لوحة المرشد
            </span>
          </Link>
        </div>

        <div className="hidden md:flex md:flex-1 md:justify-center md:px-4">
          <form onSubmit={handleSearch} className="relative w-full max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-foreground/60" />
            <input
              type="search"
              placeholder="بحث في لوحة التحكم..."
              className="w-full rounded-md border border-primary-foreground/20 bg-primary-foreground/10 py-2 pr-10 pl-4 text-right text-primary-foreground placeholder:text-primary-foreground/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        <div className="flex items-center gap-2">
          <NotificationDropdown userType="mentor" className="text-primary-foreground hover:bg-primary-foreground/10" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <User className="h-5 w-5" />
                <span className="sr-only">الملف الشخصي</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium">المرشد</p>
                <p className="text-xs text-muted-foreground">
                  mentor@example.com
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="ml-2 h-4 w-4" />
                <span>الملف الشخصي</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="ml-2 h-4 w-4" />
                <span>الإعدادات</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HelpCircle className="ml-2 h-4 w-4" />
                <span>المساعدة</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="ml-2 h-4 w-4" />
                <span>تسجيل الخروج</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile navigation drawer — same pattern as the admin dashboard */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" dir="rtl">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 right-0 w-72 max-w-[85vw] overflow-y-auto bg-background text-foreground shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <span className="text-base font-semibold">لوحة المرشد</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-md p-2 hover:bg-muted"
                aria-label="إغلاق القائمة"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <form onSubmit={handleSearch} className="relative mb-4">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="بحث في لوحة التحكم..."
                  className="w-full rounded-md border bg-muted/40 py-2 pr-10 pl-4 text-right"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
              <nav className="space-y-1">
                {MOBILE_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                      pathname === item.href
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.name}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 border-t pt-4">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
