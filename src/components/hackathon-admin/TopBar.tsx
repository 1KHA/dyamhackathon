"use client"

import NotificationDropdown from "@/components/ui/notification-dropdown"

export default function TopBar() {
  return (
    <div className="bg-[#364F7A] text-primary-foreground h-12 flex items-center justify-between px-4 text-right">
      <div className="text-sm font-medium">منصة دِيَم</div>
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
