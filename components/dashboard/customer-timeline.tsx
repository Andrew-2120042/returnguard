'use client'

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShoppingCart, RotateCcw, AlertTriangle } from "lucide-react"
import { format } from "date-fns"
import { ListSkeleton } from "./loading-skeleton"

interface TimelineEvent {
  event_type: 'order' | 'return' | 'fraud_alert'
  event_id: string
  reference: string
  amount: number
  currency: string
  event_date: string
  details?: any
}

interface CustomerTimelineProps {
  customerId: string
}

export function CustomerTimeline({ customerId }: CustomerTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const res = await fetch(`/api/data/customers/${customerId}/timeline`)
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events || [])
        }
      } catch (error) {
        console.error('Failed to fetch timeline:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
  }, [customerId])

  if (loading) {
    return <ListSkeleton items={3} />
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <ShoppingCart className="h-5 w-5 text-blue-600" />
      case 'return':
        return <RotateCcw className="h-5 w-5 text-orange-600" />
      case 'fraud_alert':
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      default:
        return null
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'order':
        return 'border-blue-200 bg-blue-50'
      case 'return':
        return 'border-orange-200 bg-orange-50'
      case 'fraud_alert':
        return 'border-red-200 bg-red-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, index) => (
            <div
              key={event.event_id}
              className={`flex gap-4 p-4 rounded-lg border ${getEventColor(event.event_type)}`}
            >
              <div className="flex-shrink-0">
                {getEventIcon(event.event_type)}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium capitalize">{event.event_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.reference}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {event.currency} {event.amount?.toFixed(2)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(event.event_date), 'PPp')}
                </p>
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No timeline events found
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
