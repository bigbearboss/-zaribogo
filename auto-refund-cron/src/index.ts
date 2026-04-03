interface Env {
  SUPABASE_FUNCTION_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

async function runAutoRefundBatch(env: Env) {
  const response = await fetch(env.SUPABASE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({}),
  });

  const responseText = await response.text();
  let parsed: unknown = null;

  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = responseText;
  }

  console.log('[auto-refund-cron] status:', response.status);
  console.log('[auto-refund-cron] body:', parsed);

  if (!response.ok) {
    throw new Error(
      `[auto-refund-cron] request failed: ${response.status} ${responseText}`
    );
  }

  return parsed;
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(
      runAutoRefundBatch(env).catch((error) => {
        console.error('[auto-refund-cron] scheduled run failed:', error);
      })
    );
  },

  async fetch(_request: Request, env: Env) {
    try {
      const result = await runAutoRefundBatch(env);
      return new Response(
        JSON.stringify(
          {
            success: true,
            triggered_by: 'manual_fetch',
            result,
          },
          null,
          2
        ),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        ),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};