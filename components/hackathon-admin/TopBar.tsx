"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { usePathname, useRouter } from "next/navigation"
import { User, LogOut, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "next-themes"
import DashboardMobileMenu from "@/components/ui/dashboard-mobile-menu"
import { navItems } from "./AdminHacktonSidebar"

export default function TopBar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { setTheme, theme } = useTheme()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // The panel is not a route, so navigating inside it has to close it.
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 bg-[#2F44DC] text-primary-foreground text-right" dir="rtl">
    <div className="h-12 flex items-center justify-between px-4">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="rounded-md p-2 text-primary-foreground/80 hover:bg-primary-foreground/10 md:hidden"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="sr-only">القائمة</span>
        </button>
        <div className="text-sm font-medium">منصة دِيَم</div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden text-sm sm:block">لوحة تحكم</div>
        {/* Hidden on mobile — the hamburger panel carries تسجيل الخروج there */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={logout} 
          className="hidden text-primary-foreground hover:bg-[#53AEF5] text-xs sm:flex items-center gap-1"
        >
          <LogOut className="h-3 w-3 ml-1" />
          تسجيل الخروج
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-[#53AEF5]">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>حسابي</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>الملف الشخصي</DropdownMenuItem>
            <DropdownMenuItem>الإعدادات</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              تبديل المظهر
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>تسجيل الخروج</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <DashboardMobileMenu
      open={isMobileMenuOpen}
      items={navItems}
      pathname={pathname}
      onNavigate={() => setIsMobileMenuOpen(false)}
      onLogout={logout}
      headerHeightClass="max-h-[calc(100vh-3rem)]"
    />
    </header>
  )
}
