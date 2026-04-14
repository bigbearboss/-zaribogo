import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  console.log('[withdraw-account] function entered');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[withdraw-account] started');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('[withdraw-account] missing env', {
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(supabaseAnonKey),
        hasServiceRole: Boolean(supabaseServiceRoleKey),
      });

      return jsonResponse(500, {
        success: false,
        message: 'Missing Supabase environment variables',
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[withdraw-account] missing auth header');
      return jsonResponse(401, {
        success: false,
        message: 'Authorization header missing',
      });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error('[withdraw-account] invalid user token', userError);
      return jsonResponse(401, {
        success: false,
        message: 'Invalid user token',
        detail: userError?.message ?? null,
      });
    }

    console.log('[withdraw-account] user verified', { userId: user.id });

    const body = await req.json().catch(() => ({}));
    const reasonType = String(body?.reasonType ?? '').trim();
    const reasonDetail = String(body?.reasonDetail ?? '').trim();

    if (!reasonType) {
      console.error('[withdraw-account] missing reasonType');
      return jsonResponse(400, {
        success: false,
        message: 'reasonType is required',
      });
    }

    const { data: profileRow, error: profileReadError } = await adminClient
      .from('profiles')
      .select('email, plan_type')
      .eq('id', user.id)
      .maybeSingle();

    if (profileReadError) {
      console.error('[withdraw-account] profiles read failed', profileReadError);
      return jsonResponse(500, {
        success: false,
        message: 'Failed to read profile',
        detail: profileReadError.message,
      });
    }

    const { data: creditRow, error: creditReadError } = await adminClient
      .from('usage_credits')
      .select('total_credits, used_credits')
      .eq('user_id', user.id)
      .maybeSingle();

    if (creditReadError) {
      console.error('[withdraw-account] usage_credits read failed', creditReadError);
      return jsonResponse(500, {
        success: false,
        message: 'Failed to read usage credits',
        detail: creditReadError.message,
      });
    }

    const creditSnapshot = creditRow
      ? {
          total_credits: Number(creditRow.total_credits ?? 0),
          used_credits: Number(creditRow.used_credits ?? 0),
          remaining_credits: Math.max(
            0,
            Number(creditRow.total_credits ?? 0) - Number(creditRow.used_credits ?? 0)
          ),
        }
      : null;

    console.log('[withdraw-account] inserting withdrawal record');

    const { error: insertError } = await adminClient.from('user_withdrawals').insert({
      user_id: user.id,
      email_snapshot: profileRow?.email ?? user.email ?? null,
      reason_type: reasonType,
      reason_detail: reasonDetail || null,
      plan_type_snapshot: profileRow?.plan_type ?? null,
      credit_snapshot: creditSnapshot,
      status: 'completed',
    });

    if (insertError) {
      console.error('[withdraw-account] insert user_withdrawals failed', insertError);
      return jsonResponse(500, {
        success: false,
        message: 'Failed to insert withdrawal record',
        detail: insertError.message,
      });
    }

    console.log('[withdraw-account] updating profile inactive');

    const { error: profileUpdateError } = await adminClient
  .from('profiles')
  .update({
    is_active: false,
  })
  .eq('id', user.id);

    if (profileUpdateError) {
      console.error('[withdraw-account] profile update failed', profileUpdateError);
      return jsonResponse(500, {
        success: false,
        message: 'Failed to deactivate profile',
        detail: profileUpdateError.message,
      });
    }

    console.log('[withdraw-account] deleting auth user');

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('[withdraw-account] delete auth user failed', deleteError);
      return jsonResponse(500, {
        success: false,
        message: 'Failed to delete auth user',
        detail: deleteError.message,
      });
    }

    console.log('[withdraw-account] success', { userId: user.id });

    return jsonResponse(200, {
      success: true,
      message: 'Account withdrawn successfully',
    });
  } catch (err) {
    console.error('[withdraw-account] unexpected error', err);

    return jsonResponse(500, {
      success: false,
      message: 'Unexpected server error',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
