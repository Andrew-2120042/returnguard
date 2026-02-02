/**
 * GET /api/fraud/policies - Get merchant fraud policies
 * PUT /api/fraud/policies - Update merchant fraud policies
 * POST /api/fraud/policies - Create new policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getMerchantPolicies,
  updatePolicy,
  createPolicy,
  deletePolicy,
  validatePolicy,
  resetToDefaultPolicies,
} from '@/lib/merchant-policies';

export async function GET(request: NextRequest) {
  try {
    // Verify session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('active_only') === 'true';

    // Fetch policies
    const policies = await getMerchantPolicies(session.merchant_id, activeOnly);

    return NextResponse.json({
      success: true,
      policies,
    });
  } catch (error) {
    console.error('Error in GET policies API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Verify session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { policy_id, updates } = body;

    if (!policy_id) {
      return NextResponse.json(
        { error: 'Missing policy_id' },
        { status: 400 }
      );
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    // Validate risk score ranges if updated
    if (updates.min_risk_score !== undefined || updates.max_risk_score !== undefined) {
      const validation = await validatePolicy(
        session.merchant_id,
        {
          min_risk_score: updates.min_risk_score,
          max_risk_score: updates.max_risk_score,
        },
        policy_id
      );

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }
    }

    // Update policy
    const updatedPolicy = await updatePolicy(policy_id, updates);

    if (!updatedPolicy) {
      return NextResponse.json(
        { error: 'Failed to update policy' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      policy: updatedPolicy,
    });
  } catch (error) {
    console.error('Error in PUT policies API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { policy_type, min_risk_score, max_risk_score, actions, action } = body;

    // Handle special actions
    if (action === 'reset_to_default') {
      const success = await resetToDefaultPolicies(session.merchant_id);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to reset policies' },
          { status: 500 }
        );
      }
      const policies = await getMerchantPolicies(session.merchant_id);
      return NextResponse.json({
        success: true,
        message: 'Policies reset to defaults',
        policies,
      });
    }

    if (action === 'delete' && body.policy_id) {
      const success = await deletePolicy(body.policy_id);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to delete policy' },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Policy deleted',
      });
    }

    // Create new policy
    if (!policy_type || min_risk_score === undefined || max_risk_score === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: policy_type, min_risk_score, max_risk_score' },
        { status: 400 }
      );
    }

    // Validate policy
    const validation = await validatePolicy(session.merchant_id, {
      min_risk_score,
      max_risk_score,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Create policy
    const newPolicy = await createPolicy(session.merchant_id, {
      policy_type,
      min_risk_score,
      max_risk_score,
      actions: actions || {},
    });

    if (!newPolicy) {
      return NextResponse.json(
        { error: 'Failed to create policy' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      policy: newPolicy,
    });
  } catch (error) {
    console.error('Error in POST policies API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
