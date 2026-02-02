'use client'

import { useEffect, useState } from "react"
import { DataTable, Column } from "@/components/dashboard/data-table"
import { RiskScoreBadge } from "@/components/dashboard/risk-score-badge"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { format } from "date-fns"

interface Return {
  id: string
  shopify_return_id: string
  return_reason?: string
  return_value: number
  currency: string
  return_status: string
  shopify_created_at: string
  customer_email?: string
  risk_score?: number
  is_fraudulent?: boolean
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<Return[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    async function fetchReturns() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          search: searchQuery,
        })

        const res = await fetch(`/api/data/returns?${params}`)
        if (res.ok) {
          const data = await res.json()
          setReturns(data.returns || [])
          setTotalPages(data.pagination?.total_pages || 1)
        }
      } catch (error) {
        console.error('Failed to fetch returns:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchReturns()
  }, [currentPage, searchQuery])

  const columns: Column<Return>[] = [
    {
      key: 'shopify_return_id',
      label: 'Return #',
      sortable: true,
    },
    {
      key: 'customer_email',
      label: 'Customer',
      render: (ret) => ret.customer_email || '-',
    },
    {
      key: 'return_reason',
      label: 'Reason',
      render: (ret) => ret.return_reason || 'Not specified',
    },
    {
      key: 'shopify_created_at',
      label: 'Date',
      render: (ret) => format(new Date(ret.shopify_created_at), 'MMM d, yyyy'),
      sortable: true,
    },
    {
      key: 'return_value',
      label: 'Amount',
      render: (ret) => `${ret.currency} ${ret.return_value?.toFixed(2)}`,
      sortable: true,
    },
    {
      key: 'return_status',
      label: 'Status',
      render: (ret) => (
        <Badge variant={ret.return_status === 'completed' ? 'default' : 'outline'}>
          {ret.return_status}
        </Badge>
      ),
    },
    {
      key: 'risk_score',
      label: 'Risk',
      render: (ret) =>
        ret.risk_score !== undefined ? (
          <RiskScoreBadge score={ret.risk_score} showLabel={false} />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Returns</h1>
        <p className="text-muted-foreground mt-2">
          View and manage all returns from your store
        </p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search returns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={returns}
        loading={loading}
        emptyMessage="No returns found"
        emptyDescription="You don't have any returns yet. Returns will appear here once customers start returning items."
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
