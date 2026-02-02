'use client'

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface RiskScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function RiskScoreBadge({ score, size = 'md', showLabel = true }: RiskScoreBadgeProps) {
  const getRiskLevel = (score: number) => {
    if (score < 40) return { label: 'Low Risk', variant: 'secondary' as const, color: 'bg-green-100 text-green-800 border-green-200' }
    if (score < 70) return { label: 'Medium Risk', variant: 'default' as const, color: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
    if (score < 90) return { label: 'High Risk', variant: 'destructive' as const, color: 'bg-orange-100 text-orange-800 border-orange-200' }
    return { label: 'Critical Risk', variant: 'destructive' as const, color: 'bg-red-100 text-red-800 border-red-200 animate-pulse' }
  }

  const risk = getRiskLevel(score)

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5',
    lg: 'text-base px-3 py-1'
  }

  return (
    <Badge
      className={cn(
        risk.color,
        sizeClasses[size],
        'font-semibold'
      )}
    >
      {showLabel ? risk.label : score}
    </Badge>
  )
}
