import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing Supabase environment variables',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Authorization header missing',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid user token',
          detail: userError?.message ?? null,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reasonType = String(body?.reasonType ?? '').trim();
    const reasonDetail = String(body?.reasonDetail ?? '').trim();

    if (!reasonType) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'reasonType is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: profileRow } = await adminClient
      .from('profiles')
      .select('email, plan_type')
      .eq('id', user.id)
      .maybeSingle();

    const { data: creditRow } = await adminClient
      .from('usage_credits')
      .select('total_credits, used_credits')
      .eq('user_id', user.id)
      .maybeSingle();

    const creditSnapshot = creditRow
      ? {
          total_credits: creditRow.total_credits ?? 0,
          used_credits: creditRow.used_credits ?? 0,
          remaining_credits:
            Math.max(
              0,
              Number(creditRow.total_credits ?? 0) - Number(creditRow.used_credits ?? 0)
            ),
        }
      : null;

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
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to insert withdrawal record',
          detail: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to deactivate profile',
          detail: profileUpdateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to delete auth user',
          detail: deleteError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account withdrawn successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Unexpected server error',
        detail: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
