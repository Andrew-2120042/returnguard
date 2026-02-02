import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium">
            ← Back to Home
          </Link>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>

          <p className="text-sm text-gray-600 mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing ReturnGuard (&quot;Service&quot;), you agree to these Terms of Service.
                If you do not agree with these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed">
                ReturnGuard provides fraud risk assessment tools for Shopify merchants.
                Risk scores are recommendations based on behavioral patterns. Final return
                decisions remain the merchant&apos;s responsibility.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. Beta Program</h2>
              <p className="text-gray-700 leading-relaxed">
                ReturnGuard is currently in beta. The Service may contain bugs, and features
                may change without notice. We collect feedback to improve accuracy and reliability.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Merchant Responsibilities</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                Merchants must:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Comply with all applicable consumer protection laws</li>
                <li>Review return decisions independently</li>
                <li>Not rely solely on automated risk scores</li>
                <li>Handle customer disputes appropriately</li>
                <li>Maintain accuracy of customer data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                ReturnGuard is not liable for:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>False positive or false negative fraud assessments</li>
                <li>Customer disputes or chargebacks</li>
                <li>Lost revenue from blocked returns</li>
                <li>Reputation damage from customer complaints</li>
                <li>Legal action resulting from return decisions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Data Processing</h2>
              <p className="text-gray-700 leading-relaxed">
                We process merchant data according to our Privacy Policy. Customer data
                is anonymized using cryptographic hashing for cross-store intelligence.
                Merchants retain all customer data ownership.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Billing and Payment</h2>
              <p className="text-gray-700 leading-relaxed">
                Beta participants receive special pricing. Subscription fees are charged
                monthly through Shopify. Cancellation can occur at any time with no penalty.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Termination</h2>
              <p className="text-gray-700 leading-relaxed">
                Either party may terminate service with 30 days notice. Merchants can
                export their data before termination. We reserve the right to terminate
                accounts for violations of these terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update these terms from time to time. Continued use of the Service
                after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Contact</h2>
              <p className="text-gray-700 leading-relaxed">
                Questions about these terms? Email{' '}
                <a href="mailto:support@returnguard.app" className="text-blue-600 hover:underline">
                  support@returnguard.app
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
