import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function Home() {
  // Check if user is already authenticated
  const session = await getSession();

  if (session) {
    // Redirect to dashboard if authenticated
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            ReturnGuard
          </h1>
          <p className="text-xl text-gray-600">
            AI-powered return fraud detection for Shopify
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Features</h2>
            <ul className="space-y-2 list-disc list-inside text-gray-700">
              <li>Automatic order and return tracking</li>
              <li>Customer risk scoring</li>
              <li>Real-time webhook sync</li>
              <li>Comprehensive analytics dashboard</li>
              <li>Multiple pricing tiers</li>
            </ul>
          </div>

          <div className="pt-6 border-t">
            <p className="text-sm text-gray-600 mb-4">
              To install ReturnGuard on your Shopify store, you need your store domain:
            </p>
            <form action="/api/auth/shopify/install" method="GET" className="space-y-4">
              <div>
                <label htmlFor="shop" className="block text-sm font-medium text-gray-700 mb-2">
                  Shopify Store Domain
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="shop"
                    name="shop"
                    placeholder="yourstore.myshopify.com"
                    required
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Install App
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>
            Need help? Check out the{' '}
            <a href="/docs/SHOPIFY_SETUP.md" className="text-blue-600 hover:underline">
              setup documentation
            </a>
          </p>
        </div>

        {/* Legal Footer */}
        <footer className="border-t pt-8 mt-12">
          <div className="text-center text-sm text-gray-600 space-y-4">
            <p className="font-medium">
              ReturnGuard Beta v0.9 - Fraud risk assessment tool for Shopify merchants
            </p>
            <div className="flex justify-center gap-6">
              <a href="/legal/terms" className="hover:text-gray-900 hover:underline">
                Terms of Service
              </a>
              <a href="/legal/privacy" className="hover:text-gray-900 hover:underline">
                Privacy Policy
              </a>
              <a href="mailto:support@returnguard.app" className="hover:text-gray-900 hover:underline">
                Support
              </a>
            </div>
            <p className="text-xs text-gray-500 max-w-2xl mx-auto">
              Risk scores are recommendations only. Merchants are responsible for
              final return decisions and compliance with consumer protection laws.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
