'use client'

import { useEffect, useState } from "react"
import { DataTable, Column } from "@/components/dashboard/data-table"
import { RiskScoreBadge } from "@/components/dashboard/risk-score-badge"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { format } from "date-fns"

interface Order {
  id: string
  order_number: string
  email: string
  total_price: number
  currency: string
  financial_status: string
  shopify_created_at: string
  risk_score?: number
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          search: searchQuery,
        })

        const res = await fetch(`/api/data/orders?${params}`)
        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders || [])
          setTotalPages(data.pagination?.total_pages || 1)
        }
      } catch (error) {
        console.error('Failed to fetch orders:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [currentPage, searchQuery])

  const columns: Column<Order>[] = [
    {
      key: 'order_number',
      label: 'Order #',
      sortable: true,
    },
    {
      key: 'email',
      label: 'Customer',
      sortable: true,
    },
    {
      key: 'shopify_created_at',
      label: 'Date',
      render: (order) => format(new Date(order.shopify_created_at), 'MMM d, yyyy'),
      sortable: true,
    },
    {
      key: 'total_price',
      label: 'Amount',
      render: (order) => `${order.currency} ${order.total_price?.toFixed(2)}`,
      sortable: true,
    },
    {
      key: 'financial_status',
      label: 'Status',
      render: (order) => (
        <Badge variant={order.financial_status === 'paid' ? 'default' : 'outline'}>
          {order.financial_status}
        </Badge>
      ),
    },
    {
      key: 'risk_score',
      label: 'Risk',
      render: (order) =>
        order.risk_score !== undefined ? (
          <RiskScoreBadge score={order.risk_score} showLabel={false} />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-2">
          View all orders from your store
        </p>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders by number or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={orders}
        loading={loading}
        emptyMessage="No orders found"
        emptyDescription="You don't have any orders yet. Orders will appear here once you sync your store data."
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
