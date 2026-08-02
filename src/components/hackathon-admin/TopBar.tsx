"use client"

import Image from "next/image"
import NotificationDropdown from "@/components/ui/notification-dropdown"

export default function TopBar() {
  return (
    <div className="bg-[#364F7A] text-primary-foreground h-12 flex items-center justify-between px-4 text-right">
      <Image src="/logo2.png" alt="miyahthone" width={120} height={40} className="h-6 w-auto" />
      <div className="flex items-center gap-4">
        <div className="text-sm">لوحة تحكم</div>
        <NotificationDropdown
          userType="admin"
          className="text-primary-foreground hover:bg-[#4A6490]"
        />
      </div>
    </div>
  )
}
