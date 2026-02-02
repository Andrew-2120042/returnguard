'use client'

import { useEffect, useState } from "react"
import { DataTable, Column } from "@/components/dashboard/data-table"
import { RiskScoreBadge } from "@/components/dashboard/risk-score-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, CheckCircle2, XCircle } from "lucide-react"
import { format } from "date-fns"

interface FraudAlert {
  id: string
  alert_type: string
  severity: string
  fraud_score: number
  triggered_signals: string[]
  customer_email?: string
  return_id?: string
  status: string
  created_at: string
  merchant_feedback?: string | null
}

export default function FraudAlertsPage() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAlerts() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          search: searchQuery,
        })

        const res = await fetch(`/api/fraud/alerts?${params}`)
        if (res.ok) {
          const data = await res.json()
          setAlerts(data.alerts || [])
          setTotalPages(data.pagination?.total_pages || 1)
        }
      } catch (error) {
        console.error('Failed to fetch alerts:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
  }, [currentPage, searchQuery])

  const submitFeedback = async (alertId: string, feedback: 'accurate' | 'false_positive') => {
    setSubmittingFeedback(alertId)
    try {
      const res = await fetch(`/api/fraud/alerts/${alertId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })

      if (res.ok) {
        // Update the alert in the local state
        setAlerts(alerts.map(alert =>
          alert.id === alertId ? { ...alert, merchant_feedback: feedback } : alert
        ))
      } else {
        console.error('Failed to submit feedback')
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
    } finally {
      setSubmittingFeedback(null)
    }
  }

  const getSeverityBadge = (severity: string) => {
    const variants = {
      critical: 'destructive' as const,
      high: 'destructive' as const,
      medium: 'default' as const,
      low: 'secondary' as const,
    }
    return (
      <Badge variant={variants[severity as keyof typeof variants] || 'default'}>
        {severity}
      </Badge>
    )
  }

  const columns: Column<FraudAlert>[] = [
    {
      key: 'alert_type',
      label: 'Alert Type',
      sortable: true,
    },
    {
      key: 'customer_email',
      label: 'Customer',
      render: (alert) => alert.customer_email || '-',
    },
    {
      key: 'fraud_score',
      label: 'Risk Score',
      render: (alert) => <RiskScoreBadge score={alert.fraud_score} showLabel={false} />,
      sortable: true,
    },
    {
      key: 'triggered_signals',
      label: 'Triggered Signals',
      render: (alert) => alert.triggered_signals?.length || 0,
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (alert) => getSeverityBadge(alert.severity),
      sortable: true,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (alert) => format(new Date(alert.created_at), 'MMM d, yyyy HH:mm'),
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      render: (alert) => (
        <Badge variant={alert.status === 'resolved' ? 'secondary' : 'outline'}>
          {alert.status}
        </Badge>
      ),
    },
    {
      key: 'feedback',
      label: 'Feedback',
      render: (alert) => {
        if (alert.merchant_feedback) {
          return (
            <Badge variant={alert.merchant_feedback === 'accurate' ? 'default' : 'secondary'}>
              {alert.merchant_feedback === 'accurate' ? '✓ Accurate' : '✗ Wrong'}
            </Badge>
          )
        }

        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => submitFeedback(alert.id, 'accurate')}
              disabled={submittingFeedback === alert.id}
              className="h-7 text-xs"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Accurate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => submitFeedback(alert.id, 'false_positive')}
              disabled={submittingFeedback === alert.id}
              className="h-7 text-xs"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Wrong
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fraud Alerts</h1>
        <p className="text-muted-foreground mt-2">
          Real-time fraud detection alerts for suspicious return activity
        </p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fraud alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={alerts}
        loading={loading}
        emptyMessage="No fraud alerts"
        emptyDescription="Great news! There are no fraud alerts at this time. We'll notify you if any suspicious activity is detected."
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
