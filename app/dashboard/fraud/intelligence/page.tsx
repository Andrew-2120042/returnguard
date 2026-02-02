'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  AlertTriangle,
  TrendingUp,
  Lock,
  CheckCircle2,
  Circle,
  Info,
  RefreshCw
} from 'lucide-react';

// Types
interface MerchantData {
  id: string;
  shop_domain: string;
  data_sharing_enabled: boolean;
}

interface NetworkStats {
  total_merchants: number;
  known_fraudsters: number;
  fraud_prevented: number;
  accuracy: number;
}

interface Fraudster {
  entity_hash: string;
  fraud_score: number;
  return_rate: number;
  merchant_count: number;
  last_seen: string;
}

export default function FraudIntelligencePage() {
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [fraudsters, setFraudsters] = useState<Fraudster[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch merchant data
  const fetchMerchantData = async () => {
    try {
      const response = await fetch('/api/merchant/current');
      if (!response.ok) throw new Error('Failed to fetch merchant data');
      const data = await response.json();
      setMerchant(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load merchant data');
      throw err;
    }
  };

  // Fetch network stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/fraud/intelligence/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  // Fetch top fraudsters
  const fetchFraudsters = async () => {
    try {
      const response = await fetch('/api/fraud/intelligence/top-fraudsters');
      if (!response.ok) throw new Error('Failed to fetch fraudsters');
      const data = await response.json();
      setFraudsters(data);
    } catch (err) {
      console.error('Failed to fetch fraudsters:', err);
    }
  };

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const merchantData = await fetchMerchantData();
        if (merchantData.data_sharing_enabled) {
          await Promise.all([fetchStats(), fetchFraudsters()]);
        }
      } catch (err) {
        // Error already set in fetchMerchantData
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Toggle data sharing
  const toggleDataSharing = async () => {
    if (!merchant) return;

    setUpdating(true);
    try {
      const response = await fetch('/api/settings/data-sharing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !merchant.data_sharing_enabled }),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      const updatedMerchant = await response.json();
      setMerchant(updatedMerchant);

      // Load network data if enabled
      if (updatedMerchant.data_sharing_enabled) {
        await Promise.all([fetchStats(), fetchFraudsters()]);
      } else {
        setStats(null);
        setFraudsters([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setUpdating(false);
    }
  };

  // Get fraud score badge color
  const getFraudScoreBadge = (score: number) => {
    if (score > 90) {
      return 'bg-red-100 text-red-800 border-red-200';
    } else if (score > 70) {
      return 'bg-orange-100 text-orange-800 border-orange-200';
    } else {
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Loading fraud intelligence...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !merchant) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Data</h3>
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dataSharingEnabled = merchant?.data_sharing_enabled ?? false;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              Fraud Intelligence Network
            </h1>
          </div>
          <p className="text-gray-600 ml-11">
            Join our network to share anonymized fraud data and protect your business with collective intelligence
          </p>
        </div>

        {/* Coming Soon Banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex gap-3">
            <Info className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                🚧 Cross-Store Intelligence - Coming Soon
              </h3>
              <p className="text-yellow-800 mb-2">
                We&apos;re conducting legal review to ensure full GDPR compliance.
                Cross-store fraud detection will be available in Q2 2026.
              </p>
              <p className="text-sm text-yellow-700">
                For now, ReturnGuard analyzes fraud patterns within your store only.
                Your fraud detection is still active and protecting your business using
                11 powerful behavioral signals.
              </p>
            </div>
          </div>
        </div>

        {/* Data Sharing Toggle Card - Disabled State */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Network Participation</h2>
              <p className="text-sm text-gray-600 mt-1">
                Share fraud signals to help protect the entire merchant community
              </p>
            </div>
            <button
              onClick={toggleDataSharing}
              disabled={true}
              title="Coming soon - Legal review in progress"
              className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed bg-gray-300"
            >
              <span className="inline-block h-6 w-6 transform rounded-full bg-white transition-transform translate-x-1" />
            </button>
          </div>

          {/* Benefits List */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-start gap-3">
              {dataSharingEnabled ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${dataSharingEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  Access to network fraud database
                </p>
                <p className="text-sm text-gray-500">
                  See known fraudsters flagged by other merchants
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {dataSharingEnabled ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${dataSharingEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  Real-time fraud alerts
                </p>
                <p className="text-sm text-gray-500">
                  Get notified when high-risk entities attempt purchases
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {dataSharingEnabled ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${dataSharingEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  Enhanced detection accuracy
                </p>
                <p className="text-sm text-gray-500">
                  Leverage collective intelligence for better fraud prevention
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {dataSharingEnabled ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${dataSharingEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  Network insights and trends
                </p>
                <p className="text-sm text-gray-500">
                  Understand emerging fraud patterns across the network
                </p>
              </div>
            </div>
          </div>

          {/* Info Box */}
          {!dataSharingEnabled && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-1">Your privacy is protected</p>
                <p className="text-blue-700">
                  All shared data is anonymized and hashed. We never share customer names, emails, or other personally identifiable information. Only fraud signals and risk scores are exchanged.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        {dataSharingEnabled && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Network Size */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-8 h-8 text-gray-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.total_merchants.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">Network Size</p>
              <p className="text-xs text-gray-500 mt-1">Active merchants sharing data</p>
            </div>

            {/* Known Fraudsters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-3xl font-bold text-red-600">
                {stats.known_fraudsters.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">Known Fraudsters</p>
              <p className="text-xs text-gray-500 mt-1">Entities flagged by network</p>
            </div>

            {/* Fraud Prevented */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(stats.fraud_prevented)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Your Fraud Prevented</p>
              <p className="text-xs text-gray-500 mt-1">Losses avoided via network</p>
            </div>

            {/* Detection Accuracy */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-600">
                {stats.accuracy.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600 mt-1">Detection Accuracy</p>
              <p className="text-xs text-gray-500 mt-1">Network-wide precision rate</p>
            </div>
          </div>
        )}

        {/* Top Fraudsters Table */}
        {dataSharingEnabled && fraudsters.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Top Fraudsters</h2>
              <p className="text-sm text-gray-600 mt-1">
                Highest risk entities flagged by the network
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity Hash
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fraud Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Return Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Flagged By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {fraudsters.map((fraudster, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                          {fraudster.entity_hash.substring(0, 16)}...
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getFraudScoreBadge(fraudster.fraud_score)}`}>
                          {fraudster.fraud_score}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm ${fraudster.return_rate > 80 ? 'font-bold text-red-600' : 'text-gray-900'}`}>
                          {fraudster.return_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {fraudster.merchant_count} {fraudster.merchant_count === 1 ? 'store' : 'stores'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(fraudster.last_seen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!dataSharingEnabled && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Network Data Unavailable
            </h3>
            <p className="text-gray-600 max-w-2xl mx-auto mb-6">
              Enable data sharing above to access the fraud intelligence network. You&apos;ll gain insights into known fraudsters, network-wide fraud patterns, and real-time alerts when high-risk entities interact with your store.
            </p>
            <button
              onClick={toggleDataSharing}
              disabled={updating}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating ? 'Enabling...' : 'Enable Data Sharing'}
            </button>
          </div>
        )}

        {/* Empty fraudsters state */}
        {dataSharingEnabled && fraudsters.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Shield className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Fraudsters Detected Yet
            </h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              The network hasn&apos;t identified any high-risk entities yet. As the network grows and fraud patterns are detected, they&apos;ll appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
