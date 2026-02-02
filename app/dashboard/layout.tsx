import { Navigation } from "@/components/dashboard/navigation"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Navigation merchantName="Test Store" />
      <main className="flex-1 ml-64 p-8 bg-muted/30">
        {children}
      </main>
    </div>
  )
}
