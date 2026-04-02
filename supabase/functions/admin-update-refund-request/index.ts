import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type UpdateRefundBody = {
  refundRequestId?: string;
  action?: 'approved' | 'rejected';
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, { error: 'Missing Supabase environment variables' });
    }

    const authHeader =
      req.headers.get('Authorization') || req.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return json(401, { error: 'Missing Authorization header' });
    }

    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) {
      return json(401, { error: 'Missing JWT' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      return json(401, {
        error: 'Invalid JWT',
        detail: userError?.message ?? null,
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return json(403, {
        error: 'Admin only',
        detail: profileError?.message ?? null,
      });
    }

    const body = (await req.json()) as UpdateRefundBody;
    const { refundRequestId, action } = body;

    if (!refundRequestId || !action) {
      return json(400, {
        error: 'refundRequestId and action are required',
      });
    }

    if (!['approved', 'rejected'].includes(action)) {
      return json(400, {
        error: 'Invalid action',
      });
    }

    const { data: refundRequest, error: fetchError } = await supabaseAdmin
      .from('refund_requests')
      .select('*')
      .eq('id', refundRequestId)
      .single();

    if (fetchError || !refundRequest) {
      return json(404, {
        error: 'Refund request not found',
        detail: fetchError?.message ?? null,
      });
    }

    if (refundRequest.request_status !== 'requested') {
      return json(409, {
        error: `Refund request status is not updateable: ${refundRequest.request_status}`,
      });
    }

    const nextAdminNote =
      action === 'approved'
        ? `${refundRequest.admin_note ?? ''}\nAPPROVED_BY_ADMIN:${user.email ?? user.id}`.trim()
        : `${refundRequest.admin_note ?? ''}\nREJECTED_BY_ADMIN:${user.email ?? user.id}`.trim();

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('refund_requests')
      .update({
        request_status: action,
        admin_note: nextAdminNote,
      })
      .eq('id', refundRequestId)
      .select()
      .single();

    if (updateError || !updated) {
      return json(500, {
        error: 'Failed to update refund request',
        detail: updateError?.message ?? null,
      });
    }

    return json(200, {
      success: true,
      message: action === 'approved' ? '검토 승인 완료' : '요청 거절 완료',
      data: updated,
    });
  } catch (err) {
    console.error('[admin-update-refund-request] unexpected error:', err);
    return json(500, {
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});