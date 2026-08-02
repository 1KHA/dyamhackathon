"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { User, LogOut } from "lucide-react"
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

export default function TopBar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const { setTheme, theme } = useTheme()

  return (
    <div className="bg-[#2F44DC] text-primary-foreground h-12 flex items-center justify-between px-4 text-right">
      <div className="text-sm font-medium">منصة دِيَم</div>
      <div className="flex items-center gap-4">
        <div className="text-sm">لوحة تحكم</div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={logout} 
          className="text-primary-foreground hover:bg-[#53AEF5] text-xs flex items-center gap-1"
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
  )
}
