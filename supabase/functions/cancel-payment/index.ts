import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CancelPaymentBody = {
  refundRequestId?: string;
  orderId?: string;
  cancelReason?: string;
};

type PaymentRow = {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  status: string;
  pg_provider: string | null;
  pg_tid: string | null;
  paid_at: string | null;
};

type RefundRequestRow = {
  id: string;
  payment_id: string;
  order_id: string;
  user_id: string;
  request_status: string;
  cancel_reason: string | null;
  admin_note: string | null;
  created_at: string;
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
    const tossSecretKey = Deno.env.get('TOSS_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, {
        error: 'Missing Supabase environment variables',
      });
    }

    if (!tossSecretKey) {
      return json(500, {
        error: 'Missing TOSS_SECRET_KEY',
      });
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

    // gateway 검증 대신 여기서 직접 JWT 검증
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
      .select('is_admin, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return json(403, {
        error: 'Admin only',
        detail: profileError?.message ?? null,
      });
    }

    const body = (await req.json()) as CancelPaymentBody;
    const { refundRequestId, orderId, cancelReason } = body;

    if (!refundRequestId && !orderId) {
      return json(400, {
        error: 'refundRequestId or orderId is required',
      });
    }

    let refundRequest: RefundRequestRow | null = null;

    if (refundRequestId) {
      const { data, error } = await supabaseAdmin
        .from('refund_requests')
        .select('*')
        .eq('id', refundRequestId)
        .single();

      if (error || !data) {
        return json(404, {
          error: 'Refund request not found',
          detail: error?.message ?? null,
        });
      }

      refundRequest = data as RefundRequestRow;
    } else if (orderId) {
      const { data, error } = await supabaseAdmin
        .from('refund_requests')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return json(404, {
          error: 'Refund request not found for orderId',
          detail: error?.message ?? null,
        });
      }

      refundRequest = data as RefundRequestRow;
    }

    if (!refundRequest) {
      return json(404, { error: 'Refund request not found' });
    }

    if (refundRequest.request_status === 'completed') {
      return json(409, {
        error: 'Refund already completed',
      });
    }

    if (!['approved', 'requested'].includes(refundRequest.request_status)) {
      return json(409, {
        error: `Refund request status is not executable: ${refundRequest.request_status}`,
      });
    }

    const { data: paymentData, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('id, user_id, order_id, amount, status, pg_provider, pg_tid, paid_at')
      .eq('id', refundRequest.payment_id)
      .single();

    if (paymentError || !paymentData) {
      return json(404, {
        error: 'Payment not found',
        detail: paymentError?.message ?? null,
      });
    }

    const payment = paymentData as PaymentRow;

    if (payment.status === 'refunded') {
      await supabaseAdmin
        .from('refund_requests')
        .update({
          request_status: 'completed',
          admin_note: `${refundRequest.admin_note ?? ''}\nALREADY_REFUNDED_SYNCED`.trim(),
        })
        .eq('id', refundRequest.id);

      return json(200, {
        success: true,
        message: '이미 환불된 결제 건으로 확인되어 상태만 동기화했습니다.',
      });
    }

    if (!payment.pg_tid) {
      return json(400, {
        error: 'pg_tid is missing on payment',
      });
    }

    const authValue = btoa(`${tossSecretKey}:`);
    const tossResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${payment.pg_tid}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authValue}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancelReason:
            cancelReason || refundRequest.cancel_reason || '관리자의 환불 실행',
        }),
      }
    );

  const tossJson = await tossResponse.json().catch(() => null);

const alreadyCancelled =
  tossResponse.status === 400 &&
  typeof tossJson?.message === 'string' &&
  tossJson.message.includes('이미 취소된 결제');

if (!tossResponse.ok && !alreadyCancelled) {
  await supabaseAdmin.from('payment_events').insert({
    payment_id: payment.id,
    order_id: payment.order_id,
    event_type: 'refund_failed',
    source: 'cancel-payment',
    payload_json: {
      reason: cancelReason || refundRequest.cancel_reason || null,
      toss_status: tossResponse.status,
      toss_response: tossJson,
    },
  });

  return json(502, {
    error: 'Toss cancel failed',
    detail: tossJson?.message || null,
    toss_status: tossResponse.status,
  });
}

   const { data: paymentUpdateData, error: paymentUpdateError } = await supabaseAdmin
  .from('payments')
  .update({
    status: 'refunded',
  })
  .eq('id', payment.id)
  .select();

console.log('[cancel-payment] payment update data:', paymentUpdateData);
console.log('[cancel-payment] payment update error:', paymentUpdateError);

if (paymentUpdateError || !paymentUpdateData || paymentUpdateData.length === 0) {
  return json(500, {
    error: 'Payment update failed',
    detail: paymentUpdateError?.message ?? 'No rows updated',
    paymentId: payment.id,
  });
}

    const { error: refundUpdateError } = await supabaseAdmin
      .from('refund_requests')
      .update({
        request_status: 'completed',
        admin_note: `${refundRequest.admin_note ?? ''}\nCANCELLED_BY_ADMIN:${user.email ?? user.id}`.trim(),
      })
      .eq('id', refundRequest.id);

    if (refundUpdateError) {
      return json(500, {
        error: 'Failed to update refund request status',
        detail: refundUpdateError.message,
      });
    }

    const { error: eventInsertError } = await supabaseAdmin
  .from('payment_events')
  .insert({
    payment_id: payment.id,
    order_id: payment.order_id,
    event_type: alreadyCancelled ? 'refund_already_cancelled_synced' : 'refund_completed',
    source: 'cancel-payment',
    payload_json: {
      refund_request_id: refundRequest.id,
      cancelled_by: user.email ?? user.id,
      cancel_reason: cancelReason || refundRequest.cancel_reason || null,
      toss_response: tossJson,
    },
  });
    
    if (eventInsertError) {
      return json(500, {
        error: 'Failed to insert payment event',
        detail: eventInsertError.message,
      });
    }

    return json(200, {
      success: true,
      message: '환불이 성공적으로 완료되었습니다.',
      data: {
        paymentId: payment.id,
        refundRequestId: refundRequest.id,
        orderId: payment.order_id,
        paymentStatus: 'refunded',
        refundRequestStatus: 'completed',
      },
    });
  } catch (err) {
    console.error('[cancel-payment] unexpected error:', err);
    return json(500, {
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
