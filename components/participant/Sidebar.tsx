"use client"

import { useMemo, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Home, Users, Flag, Award, Star, Book, Calendar, QrCode, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { usePermissions } from "@/hooks/usePermissions"
import { useSidebar } from "@/contexts/sidebar-context"

const navItems = [
  { 
    name: "لوحة التحكم", 
    href: "/participant-dashboard", 
    icon: Home,
    permission: { category: 'dashboard', action: 'view' }
  },
  { 
    name: "فريقي", 
    href: "/participant-dashboard/team", 
    icon: Flag,
    permission: { category: 'users', action: 'view' },
    showWhen: 'hasTeam' // Only show when participant has a team
  },
  { 
    name: "الفرق", 
    href: "/participant-dashboard/teams", 
    icon: Users,
    permission: { category: 'users', action: 'view' },
    showWhen: 'noTeam' // Only show when participant doesn't have a team
  },
  { 
    name: "الدعوات المستلمة", 
    href: "/participant-dashboard/join-requests", 
    icon: Users,
    permission: { category: 'users', action: 'view' },
    showWhen: 'isLeader' // Only show for team leaders
  },
  { 
    name: "التسليمات", 
    href: "/participant-dashboard/milestones", 
    icon: Star,
    permission: { category: 'startups', action: 'view' }
  },
  { 
    name: "الموجهون", 
    href: "/participant-dashboard/mentors", 
    icon: Book,
    permission: { category: 'mentorship', action: 'view' }
  },
  {
    name: "الفعاليات",
    href: "/participant-dashboard/events",
    icon: Calendar,
    permission: { category: 'events', action: 'view' }
  },
  {
    name: "بطاقتي",
    href: "/participant-dashboard/badge",
    icon: QrCode,
    permission: { category: 'events', action: 'view' }
  }
]

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const [participantData, setParticipantData] = useState<{
    teamId: string | null;
    isLeader: boolean;
  } | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const pathname = usePathname()
  const { hasPermission, loading } = usePermissions()

  // Fetch participant data
  useEffect(() => {
    const fetchParticipantData = async () => {
      try {
        const response = await fetch('/api/participant/me')
        if (response.ok) {
          const data = await response.json()
          setParticipantData({
            teamId: data.teamId,
            isLeader: data.isLeader
          })
        }
      } catch (error) {
        console.error('Error fetching participant data:', error)
      } finally {
        setDataLoading(false)
      }
    }

    fetchParticipantData()
  }, [])

  // Filter navigation items based on permissions and participant status
  const filteredNavItems = useMemo(() => {
    if (loading || dataLoading) return []
    
    return navItems.filter(item => {
      // Check permissions first
      if (item.permission && !hasPermission(item.permission)) {
        return false
      }

      // Check conditional display rules
      if (item.showWhen && participantData) {
        switch (item.showWhen) {
          case 'hasTeam':
            return participantData.teamId !== null
          case 'noTeam':
            return participantData.teamId === null
          case 'isLeader':
            return participantData.isLeader && participantData.teamId !== null
          default:
            return true
        }
      }

      return true
    })
  }, [hasPermission, loading, participantData, dataLoading])

  return (
    <motion.aside
      className={cn(
        "fixed top-12 left-0 bg-card text-card-foreground border-r h-[calc(100vh-3rem)] z-10",
        isCollapsed ? "w-16" : "w-64",
      )}
      animate={{ width: isCollapsed ? 64 : 256 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="flex flex-col h-full text-left">
        <div className="flex items-center justify-between p-4 border-b">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="py-2">
            {filteredNavItems.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center p-2 mx-2 rounded-lg",
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className={cn("ml-2", { "sr-only": isCollapsed })}>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </motion.aside>
  )
}
