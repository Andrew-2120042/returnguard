'use client'

import { useEffect, useState } from "react"
import { StatsCard } from "@/components/dashboard/stats-card"
import { CardSkeleton } from "@/components/dashboard/loading-skeleton"
import { ShoppingCart, RotateCcw, ShieldCheck, TrendingUp, Info } from "lucide-react"

interface DashboardStats {
  total_orders: number
  total_returns: number
  fraud_prevented: number
  avg_risk_score: number
  orders_change?: number
  returns_change?: number
  fraud_change?: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        // For now, using mock data since the stats endpoint might not exist yet
        // TODO: Replace with actual API call when /api/data/dashboard/stats is created
        await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API call

        setStats({
          total_orders: 1247,
          total_returns: 89,
          fraud_prevented: 12,
          avg_risk_score: 34,
          orders_change: 12.5,
          returns_change: -5.2,
          fraud_change: 8.1,
        })
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your store&apos;s return fraud prevention
        </p>
      </div>

      {/* Beta Notice Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex gap-3">
          <Info className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              🎉 Welcome to ReturnGuard Beta
            </h3>
            <p className="text-blue-800 mb-2">
              You&apos;re part of our exclusive beta program! We&apos;re actively improving
              fraud detection based on real merchant feedback.
            </p>
            <p className="text-sm text-blue-700">
              See something off? Use the feedback buttons on fraud alerts to help
              us learn and improve accuracy.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatsCard
              title="Total Orders"
              value={stats.total_orders.toLocaleString()}
              change={stats.orders_change}
              trend="up"
              icon={ShoppingCart}
            />
            <StatsCard
              title="Total Returns"
              value={stats.total_returns.toLocaleString()}
              change={stats.returns_change}
              trend="down"
              icon={RotateCcw}
            />
            <StatsCard
              title="Fraud Prevented"
              value={`$${(stats.fraud_prevented * 1000).toLocaleString()}`}
              change={stats.fraud_change}
              trend="up"
              icon={ShieldCheck}
            />
            <StatsCard
              title="Avg Risk Score"
              value={stats.avg_risk_score}
              icon={TrendingUp}
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold mb-4">Recent Fraud Alerts</h3>
          <p className="text-sm text-muted-foreground">
            No fraud alerts in the last 7 days
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold mb-4">High-Risk Customers</h3>
          <p className="text-sm text-muted-foreground">
            No high-risk customers detected
          </p>
        </div>
      </div>
    </div>
  )
}
