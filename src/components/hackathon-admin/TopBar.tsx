"use client"

import Image from "next/image"
import EventTimeline from "@/components/ui/event-timeline"
import NotificationDropdown from "@/components/ui/notification-dropdown"

export default function TopBar() {
  return (
    <div className="bg-[#2F44DC] text-primary-foreground h-12 flex items-center justify-between px-4 text-right">
      <Image src="/logo2.png" alt="miyahthone" width={120} height={40} className="h-6 w-auto shrink-0" />
      {/* Hackathon journey timeline */}
      <div className="hidden md:flex flex-1 justify-center px-4 min-w-0">
        <EventTimeline />
      </div>
      <div className="flex flex-1 justify-center px-2 min-w-0 md:hidden">
        <EventTimeline variant="chip" />
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-sm">لوحة تحكم</div>
        <NotificationDropdown
          userType="admin"
          className="text-primary-foreground hover:bg-[#53AEF5]"
        />
      </div>
    </div>
  )
}
