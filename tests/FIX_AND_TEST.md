# Quick Fix and Test Guide

You encountered an error because the fraud trigger was looking for the wrong column. Here's how to fix it and create test data:

---

## STEP 1: Fix the Trigger (1 minute)

1. Open Supabase SQL Editor: https://supabase.com/dashboard
2. Copy the contents of `tests/fix-trigger.sql`
3. Paste into SQL Editor
4. Click **"Run"**

**Expected Result:**
```
✓ Trigger fixed successfully!
```

---

## STEP 2: Create Test Data (2 minutes)

1. Stay in Supabase SQL Editor
2. Copy the contents of `tests/create-test-data-simple.sql`
3. Paste into SQL Editor
4. Click **"Run"**

**Expected Result:**
```
✓ TEST DATA CREATED SUCCESSFULLY!

Merchant: 1
Customers: 3
Orders: 30
Returns: 17

Customer Risk Scores:
- John Returner: 92 (CRITICAL)
- Jane Smith: 88 (HIGH)
- Sarah Johnson: 15 (LOW)
```

---

## STEP 3: View Your Data (30 seconds)

Open http://localhost:3000/dashboard in your browser.

**You should now see:**

1. **Dashboard Home**
   - Stats showing real numbers

2. **Customers Page**
   - 3 customers in the table
   - Risk badges: 🟢 Green (Sarah), 🟠 Orange (Jane), 🔴 Red (John)

3. **Orders Page**
   - 30 orders total

4. **Returns Page**
   - 17 returns total
   - Risk scores displayed

---

## STEP 4: Test Fraud Detection (Optional)

Run this query in Supabase to see fraud signals:

```sql
-- Get fraud analysis for Serial Returner
SELECT
  c.first_name || ' ' || c.last_name as customer,
  c.risk_score,
  c.risk_level,
  c.total_orders,
  c.total_returns,
  c.return_rate
FROM customers c
WHERE c.email = 'john.returner@fraud.com';
```

---

## What Was Wrong?

The error:
```
record "new" has no field "risk_score"
```

**Cause:** The fraud trigger in `003_fraud_auto_analysis_trigger.sql` was checking for `NEW.risk_score` but the `returns` table doesn't have that column.

**Fix:** Changed line 19 from:
```sql
AND NEW.risk_score IS NULL  ❌
```
To:
```sql
AND NEW.fraud_confidence IS NULL  ✅
```

---

## Files Created for You

1. **`tests/fix-trigger.sql`** - Fixes the trigger error
2. **`tests/create-test-data-simple.sql`** - Creates test data (simplified, avoids trigger issues)
3. **`tests/FIX_AND_TEST.md`** - This guide

---

## After This Works

Once you have test data:

1. ✅ Dashboard will show real stats
2. ✅ All tables will populate
3. ✅ Risk scores will be calculated
4. ✅ You can test all features

Then you can:
- Test fraud detection
- Test cross-store intelligence
- Test all API endpoints with real data
- Deploy to production!

---

**Total Time: 3-5 minutes** ⏱️

Run Step 1, then Step 2, then view your dashboard! 🚀
