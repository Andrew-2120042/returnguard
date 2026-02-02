'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DataTable, Column } from "@/components/dashboard/data-table"
import { RiskScoreBadge } from "@/components/dashboard/risk-score-badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Download } from "lucide-react"

interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string
  total_orders: number
  total_returns: number
  return_rate: number
  risk_score: number
}

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    async function fetchCustomers() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          search: searchQuery,
        })

        const res = await fetch(`/api/data/customers?${params}`)
        if (res.ok) {
          const data = await res.json()
          setCustomers(data.customers || [])
          setTotalPages(data.pagination?.total_pages || 1)
        }
      } catch (error) {
        console.error('Failed to fetch customers:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCustomers()
  }, [currentPage, searchQuery])

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (customer) => `${customer.first_name} ${customer.last_name}`,
      sortable: true,
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
    },
    {
      key: 'total_orders',
      label: 'Orders',
      sortable: true,
    },
    {
      key: 'total_returns',
      label: 'Returns',
      sortable: true,
    },
    {
      key: 'return_rate',
      label: 'Return Rate',
      render: (customer) => `${customer.return_rate?.toFixed(1)}%`,
      sortable: true,
    },
    {
      key: 'risk_score',
      label: 'Risk Score',
      render: (customer) => <RiskScoreBadge score={customer.risk_score} />,
      sortable: true,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-2">
            View and manage customer fraud risk profiles
          </p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={customers}
        loading={loading}
        emptyMessage="No customers found"
        emptyDescription="You don't have any customers yet. Customers will appear here once you sync your store data."
        onRowClick={(customer) => router.push(`/dashboard/customers/${customer.id}`)}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
