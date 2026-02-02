import Link from 'next/link';

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>

          <p className="text-sm text-gray-600 mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Information We Collect</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                We collect the following types of information:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Merchant account information (email, shop name, shop domain)</li>
                <li>Order data (customer behavior, return patterns, order history)</li>
                <li>Return data (reasons, timing, fraud signals)</li>
                <li>Usage data (features used, feedback submitted, analytics)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. How We Use Data</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                We use collected data to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Provide fraud risk assessments and scoring</li>
                <li>Improve detection accuracy through machine learning</li>
                <li>Generate merchant analytics and insights</li>
                <li>Provide customer support and troubleshooting</li>
                <li>Improve our Service and develop new features</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. Data Sharing</h2>
              <p className="text-gray-700 leading-relaxed">
                We do NOT share customer personal information across merchants.
                Customer emails, phone numbers, and addresses are cryptographically
                hashed (SHA-256) before any cross-store analysis. Only anonymized
                fraud signals are shared when merchants opt into the network.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                Cross-store intelligence is currently disabled and will only be
                enabled after legal review (Q2 2026).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Data Security</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                We implement industry-standard security measures:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>AES-256-GCM encryption for sensitive data</li>
                <li>PBKDF2 key derivation for access tokens</li>
                <li>Row-level security in database</li>
                <li>HTTPS/TLS 1.3 for all data transmission</li>
                <li>Regular security audits and updates</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Your Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                Merchants can:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Export all data via API or support request</li>
                <li>Delete their account and all associated data</li>
                <li>Opt out of data sharing (when feature launches)</li>
                <li>Request data corrections or updates</li>
                <li>Access fraud detection transparency reports</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. GDPR Compliance</h2>
              <p className="text-gray-700 leading-relaxed">
                We comply with GDPR requirements for European merchants and customers.
                We respond to data requests within 30 days and provide full data
                portability. Customer data is deleted upon merchant request via
                GDPR webhooks.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Cookies and Tracking</h2>
              <p className="text-gray-700 leading-relaxed">
                We use essential cookies for authentication and session management.
                We do NOT use tracking cookies or third-party analytics without consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain merchant data for the duration of the subscription plus
                90 days for backup purposes. Customer behavioral data is retained
                for fraud detection accuracy. Merchants can request deletion at any time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed mb-2">
                We use the following third-party services:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Shopify (for OAuth and API access)</li>
                <li>Supabase (for database hosting)</li>
                <li>Upstash (for rate limiting and cache)</li>
                <li>Vercel (for hosting and deployment)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                All third-party services are GDPR-compliant and SOC 2 certified.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Changes to Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this policy to reflect changes in our practices or
                legal requirements. We will notify merchants of significant changes
                via email and dashboard notification.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">11. Contact</h2>
              <p className="text-gray-700 leading-relaxed">
                Privacy questions or data requests? Email{' '}
                <a href="mailto:privacy@returnguard.app" className="text-blue-600 hover:underline">
                  privacy@returnguard.app
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
