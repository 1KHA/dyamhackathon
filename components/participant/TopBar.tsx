"use client";

import { useState } from "react";
import Link from "next/link";
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
  Users,
  Calendar,
  Target,
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

export default function TopBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, logout } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Handle search functionality
      setSearchQuery("");
    }
  };

  const handleLogout = async () => {
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

          <Link href="/participant-dashboard" className="flex items-center">
            <Image src="/logo2.png" alt="miyahthone" width={120} height={40} className="h-7 w-auto" />
            <span className="ml-1 rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-medium">
              لوحة المشارك
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
          <NotificationDropdown userType="participant" className="text-primary-foreground hover:bg-primary-foreground/10" />

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
                <p className="text-sm font-medium">{user?.fullName || user?.name || 'المشارك'}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.email || 'participant@example.com'}
                </p>
                {user?.teamName && (
                  <p className="text-xs text-muted-foreground">
                    فريق: {user.teamName}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard">
                  <User className="ml-2 h-4 w-4" />
                  <span>الملف الشخصي</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard/teams">
                  <Users className="ml-2 h-4 w-4" />
                  <span>فريقي</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard/events">
                  <Calendar className="ml-2 h-4 w-4" />
                  <span>الفعاليات</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/participant-dashboard/milestones">
                  <Target className="ml-2 h-4 w-4" />
                  <span>المراحل</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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

      {isMobileMenuOpen && (
        <div className="border-t border-primary-foreground/20 p-4 md:hidden">
          <form onSubmit={handleSearch} className="relative mb-4">
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
      )}
    </header>
  );
}
