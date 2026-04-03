import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_AUTO_REFUND_AMOUNT = 50000;

type RefundRequestRow = {
  id: string;
  payment_id: string;
  order_id: string;
  user_id: string;
  request_status: string;
  cancel_reason: string | null;
  admin_note: string | null;
  created_at: string;
  is_auto?: boolean | null;
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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

async function cancelTossPayment(pgTid: string, cancelReason: string, tossSecretKey: string) {
  const authValue = btoa(`${tossSecretKey}:`);

  const response = await fetch(
    `https://api.tosspayments.com/v1/payments/${pgTid}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authValue}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cancelReason,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
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

    if (!supabaseUrl || !supabaseServiceRoleKey || !tossSecretKey) {
      return json(500, {
        error: 'Missing required environment variables',
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: refundRequests, error: refundError } = await supabaseAdmin
      .from('refund_requests')
      .select('*')
      .eq('is_auto', true)
      .eq('request_status', 'approved')
      .order('created_at', { ascending: true })
      .limit(10);

    if (refundError) {
      return json(500, {
        error: 'Failed to fetch auto refund requests',
        detail: refundError.message,
      });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const refundRequest of (refundRequests ?? []) as RefundRequestRow[]) {
      try {
        const { data: paymentData, error: paymentError } = await supabaseAdmin
          .from('payments')
          .select('id, user_id, order_id, amount, status, pg_provider, pg_tid, paid_at')
          .eq('id', refundRequest.payment_id)
          .single();

        if (paymentError || !paymentData) {
          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: false,
            reason: 'payment_not_found',
            detail: paymentError?.message ?? null,
          });
          continue;
        }

        const payment = paymentData as PaymentRow;

        if (payment.amount > MAX_AUTO_REFUND_AMOUNT) {
  results.push({
    refundRequestId: refundRequest.id,
    orderId: refundRequest.order_id,
    success: false,
    reason: 'amount_exceeds_auto_refund_limit',
    detail: `자동 환불 한도 초과: ${payment.amount}원`,
  });

  continue;
}

        if (refundRequest.request_status !== 'approved') {
          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: false,
            reason: 'invalid_refund_status',
            detail: refundRequest.request_status,
          });
          continue;
        }

        if (payment.status === 'refunded') {
          await supabaseAdmin
            .from('refund_requests')
            .update({
              request_status: 'completed',
              admin_note: `${refundRequest.admin_note ?? ''}\nAUTO_BATCH_SYNCED_ALREADY_REFUNDED`.trim(),
            })
            .eq('id', refundRequest.id);

          await supabaseAdmin.from('payment_events').insert({
            payment_id: payment.id,
            order_id: payment.order_id,
            event_type: 'refund_already_cancelled_synced',
            source: 'process-auto-refunds',
            payload_json: {
              refund_request_id: refundRequest.id,
              reason: refundRequest.cancel_reason ?? null,
            },
          });

          await supabaseAdmin.from('admin_action_logs').insert({
            admin_user_id: refundRequest.user_id,
            action_type: 'refund_synced_already_cancelled',
            target_type: 'refund_request',
            target_id: refundRequest.id,
            order_id: payment.order_id,
            detail_json: {
              payment_id: payment.id,
              previous_payment_status: payment.status,
              next_payment_status: 'refunded',
              previous_refund_request_status: refundRequest.request_status,
              next_refund_request_status: 'completed',
              cancel_reason: refundRequest.cancel_reason ?? null,
              is_auto: true,
              executed_by: 'auto_batch',
            },
          });

          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: true,
            action: 'synced_already_refunded',
          });
          continue;
        }

        if (!payment.pg_tid) {
          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: false,
            reason: 'missing_pg_tid',
          });
          continue;
        }

        const tossResult = await cancelTossPayment(
          payment.pg_tid,
          refundRequest.cancel_reason || '자동 환불 실행',
          tossSecretKey
        );

        const tossMessage = `${tossResult.data?.message ?? ''} ${tossResult.data?.detail ?? ''}`.trim();
        const alreadyCancelled =
          tossResult.status === 400 &&
          /이미\s*취소된\s*결제/.test(tossMessage);

        if (!tossResult.ok && !alreadyCancelled) {
          await supabaseAdmin.from('payment_events').insert({
            payment_id: payment.id,
            order_id: payment.order_id,
            event_type: 'refund_failed',
            source: 'process-auto-refunds',
            payload_json: {
              refund_request_id: refundRequest.id,
              toss_status: tossResult.status,
              toss_response: tossResult.data,
            },
          });

          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: false,
            reason: 'toss_cancel_failed',
            detail: tossResult.data?.message || tossResult.data?.detail || null,
          });
          continue;
        }

        const { error: paymentUpdateError } = await supabaseAdmin
          .from('payments')
          .update({ status: 'refunded' })
          .eq('id', payment.id);

        if (paymentUpdateError) {
          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: false,
            reason: 'payment_update_failed',
            detail: paymentUpdateError.message,
          });
          continue;
        }

        const { error: refundUpdateError } = await supabaseAdmin
          .from('refund_requests')
          .update({
            request_status: 'completed',
            admin_note: `${refundRequest.admin_note ?? ''}\nAUTO_BATCH_EXECUTED`.trim(),
          })
          .eq('id', refundRequest.id);

        if (refundUpdateError) {
          results.push({
            refundRequestId: refundRequest.id,
            orderId: refundRequest.order_id,
            success: false,
            reason: 'refund_request_update_failed',
            detail: refundUpdateError.message,
          });
          continue;
        }

        await supabaseAdmin.from('payment_events').insert({
          payment_id: payment.id,
          order_id: payment.order_id,
          event_type: alreadyCancelled ? 'refund_already_cancelled_synced' : 'refund_completed',
          source: 'process-auto-refunds',
          payload_json: {
            refund_request_id: refundRequest.id,
            cancel_reason: refundRequest.cancel_reason ?? null,
            toss_response: tossResult.data,
          },
        });

        await supabaseAdmin.from('admin_action_logs').insert({
          admin_user_id: refundRequest.user_id,
          action_type: alreadyCancelled
            ? 'refund_synced_already_cancelled'
            : 'refund_executed',
          target_type: 'refund_request',
          target_id: refundRequest.id,
          order_id: payment.order_id,
          detail_json: {
            payment_id: payment.id,
            previous_payment_status: payment.status,
            next_payment_status: 'refunded',
            previous_refund_request_status: refundRequest.request_status,
            next_refund_request_status: 'completed',
            cancel_reason: refundRequest.cancel_reason ?? null,
            is_auto: true,
            executed_by: 'auto_batch',
          },
        });

        results.push({
          refundRequestId: refundRequest.id,
          orderId: refundRequest.order_id,
          success: true,
          action: alreadyCancelled ? 'synced_already_cancelled' : 'refund_executed',
        });
      } catch (itemError) {
        results.push({
          refundRequestId: refundRequest.id,
          orderId: refundRequest.order_id,
          success: false,
          reason: 'unexpected_error',
          detail: itemError instanceof Error ? itemError.message : String(itemError),
        });
      }
    }

    return json(200, {
      success: true,
      processedCount: results.length,
      results,
    });
  } catch (err) {
    console.error('[process-auto-refunds] unexpected error:', err);
    return json(500, {
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
