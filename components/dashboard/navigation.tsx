'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  RotateCcw,
  AlertTriangle,
  Network,
  Settings,
  ShieldAlert,
} from "lucide-react"

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
  { name: 'Returns', href: '/dashboard/returns', icon: RotateCcw },
  { name: 'Fraud Alerts', href: '/dashboard/fraud/alerts', icon: AlertTriangle },
  { name: 'Fraud Intelligence', href: '/dashboard/fraud/intelligence', icon: Network },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

interface NavigationProps {
  merchantName?: string
}

export function Navigation({ merchantName }: NavigationProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen w-64 flex-col fixed left-0 top-0 border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <div className="flex flex-col">
            <span className="font-bold text-lg">ReturnGuard</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium w-fit">
              BETA v0.9
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User Info */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
            {merchantName?.[0]?.toUpperCase() || 'M'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{merchantName || 'Merchant'}</p>
            <p className="text-xs text-muted-foreground">Store Owner</p>
          </div>
        </div>
      </div>
    </div>
  )
}
