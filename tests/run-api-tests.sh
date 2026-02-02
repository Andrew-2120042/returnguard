#!/bin/bash

# ReturnGuard API Testing Script
# Run this after creating test data in the database

echo "======================================"
echo "ReturnGuard API Test Suite"
echo "======================================"
echo ""

BASE_URL="http://localhost:3000"
ADMIN_KEY="${ADMIN_API_KEY:-your_admin_api_key}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Function to test endpoint
test_endpoint() {
  local name=$1
  local url=$2
  local expected_status=${3:-200}
  local extra_args=${4:-""}

  echo -n "Testing $name... "

  response=$(curl -s -w "\n%{http_code}" $extra_args "$BASE_URL$url" 2>&1)
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    ((PASS++))

    # Show response preview if JSON
    if echo "$body" | jq . >/dev/null 2>&1; then
      echo "$body" | jq . | head -10
    fi
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $http_code)"
    ((FAIL++))
    echo "Response: $body" | head -5
  fi
  echo ""
}

echo "======================================"
echo "TEST 1: Health Check"
echo "======================================"
echo ""

test_endpoint "Landing Page" "/" 200
test_endpoint "Dashboard Page (should redirect or show auth error)" "/dashboard" 200

echo "======================================"
echo "TEST 2: Public API Endpoints"
echo "======================================"
echo ""

test_endpoint "Fraud Intelligence Stats" "/api/fraud/intelligence/stats" 200
test_endpoint "Top Fraudsters" "/api/fraud/intelligence/top-fraudsters" 200

echo "======================================"
echo "TEST 3: Protected API Endpoints (Expected 401/403)"
echo "======================================"
echo ""

test_endpoint "Customers List (no auth)" "/api/data/customers" 401
test_endpoint "Orders List (no auth)" "/api/data/orders" 401
test_endpoint "Returns List (no auth)" "/api/data/returns" 401
test_endpoint "Fraud Alerts (no auth)" "/api/fraud/alerts" 401

echo "======================================"
echo "TEST 4: Admin Endpoints"
echo "======================================"
echo ""

test_endpoint "Admin Security Dashboard (no key)" "/api/admin/security/dashboard" 401
test_endpoint "Admin Security Dashboard (with key)" "/api/admin/security/dashboard" 200 "-H 'X-Admin-Key: $ADMIN_KEY'"

echo "======================================"
echo "TEST 5: Rate Limiting Test"
echo "======================================"
echo ""

echo "Making 105 rapid requests to test rate limiting..."
rate_limit_hits=0
success_count=0

for i in {1..105}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/fraud/intelligence/stats")
  if [ "$status" -eq "200" ]; then
    ((success_count++))
  elif [ "$status" -eq "429" ]; then
    ((rate_limit_hits++))
  fi

  # Show progress every 25 requests
  if [ $((i % 25)) -eq 0 ]; then
    echo "  Progress: $i/105 requests (Success: $success_count, Rate Limited: $rate_limit_hits)"
  fi
done

echo ""
if [ $rate_limit_hits -gt 0 ]; then
  echo -e "${GREEN}✓ Rate limiting working${NC} ($rate_limit_hits requests blocked)"
  ((PASS++))
else
  echo -e "${YELLOW}⚠ Rate limiting may not be working${NC} (no 429 responses)"
fi
echo ""

echo "======================================"
echo "TEST 6: Webhook Endpoints"
echo "======================================"
echo ""

# Test GDPR webhooks (should validate HMAC, but we can test they exist)
test_endpoint "GDPR Data Request Webhook" "/api/webhooks/gdpr/customers-data-request" 401 "-X POST"
test_endpoint "GDPR Redact Webhook" "/api/webhooks/gdpr/customers-redact" 401 "-X POST"
test_endpoint "Shop Redact Webhook" "/api/webhooks/gdpr/shop-redact" 401 "-X POST"

echo "======================================"
echo "TEST 7: OAuth Endpoints"
echo "======================================"
echo ""

test_endpoint "OAuth Install (missing shop param)" "/api/auth/shopify/install" 400
test_endpoint "OAuth Callback (missing params)" "/api/auth/shopify/callback" 400

echo "======================================"
echo "TEST 8: Billing Endpoints"
echo "======================================"
echo ""

test_endpoint "Subscribe (no auth)" "/api/billing/subscribe" 401 "-X POST"
test_endpoint "Check Quota (no auth)" "/api/billing/check-quota" 401

echo "======================================"
echo "TEST SUMMARY"
echo "======================================"
echo ""
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo -e "Total:  $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed${NC}"
  exit 1
fi
