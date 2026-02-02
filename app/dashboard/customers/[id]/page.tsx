'use client'

import { useEffect, useState } from "react"
import { use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskScoreBadge } from "@/components/dashboard/risk-score-badge"
import { CustomerTimeline } from "@/components/dashboard/customer-timeline"
import { DetailSkeleton } from "@/components/dashboard/loading-skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Mail, Phone, MapPin, ShoppingCart, RotateCcw } from "lucide-react"

interface CustomerDetail {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string
  default_address?: {
    address1?: string
    city?: string
    province?: string
    country?: string
    zip?: string
  }
  total_orders: number
  total_spent: number
  total_returns: number
  return_rate: number
  risk_score: number
  risk_level: string
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCustomer() {
      try {
        const res = await fetch(`/api/data/customers/${resolvedParams.id}`)
        if (res.ok) {
          const data = await res.json()
          setCustomer(data.customer)
        }
      } catch (error) {
        console.error('Failed to fetch customer:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCustomer()
  }, [resolvedParams.id])

  if (loading) {
    return <DetailSkeleton />
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Customer Not Found</h2>
        <p className="text-muted-foreground">
          The customer you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
    )
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()
  }

  const formatAddress = (address: any) => {
    if (!address) return null
    const parts = [
      address.address1,
      address.city,
      address.province,
      address.zip,
      address.country
    ].filter(Boolean)
    return parts.join(', ')
  }

  return (
    <div className="space-y-6">
      {/* Customer Header */}
      <div className="flex items-start gap-6">
        <Avatar className="h-20 w-20">
          <AvatarFallback className="text-2xl">
            {getInitials(customer.first_name, customer.last_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                {customer.first_name} {customer.last_name}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {customer.email}
                </span>
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {customer.phone}
                  </span>
                )}
              </div>
              {customer.default_address && (
                <p className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {formatAddress(customer.default_address)}
                </p>
              )}
            </div>
            <RiskScoreBadge score={customer.risk_score} size="lg" />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customer.total_orders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${customer.total_spent?.toFixed(2) || '0.00'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customer.total_returns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customer.return_rate?.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Timeline */}
      <CustomerTimeline customerId={customer.id} />
    </div>
  )
}
