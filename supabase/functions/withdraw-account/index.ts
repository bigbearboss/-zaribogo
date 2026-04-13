import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WithdrawBody = {
  reasonType?: string;
  reasonDetail?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, message: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing Authorization header" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid user session" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = (await req.json().catch(() => ({}))) as WithdrawBody;
    const reasonType = (body.reasonType || "").trim();
    const reasonDetail = (body.reasonDetail || "").trim();

    if (!reasonType) {
      return new Response(
        JSON.stringify({ success: false, message: "reasonType is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const [{ data: profile, error: profileError }, { data: credit, error: creditError }] =
      await Promise.all([
        adminClient
          .from("profiles")
          .select("id, email, plan_type, is_active")
          .eq("id", user.id)
          .maybeSingle(),
        adminClient
          .from("usage_credits")
          .select("total_credits, used_credits")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (profileError) {
      throw profileError;
    }

    if (creditError) {
      throw creditError;
    }

    const emailSnapshot = user.email ?? profile?.email ?? null;
    const planTypeSnapshot = profile?.plan_type ?? null;
    const creditSnapshot = Math.max(
      0,
      Number(credit?.total_credits ?? 0) - Number(credit?.used_credits ?? 0)
    );

    const { error: withdrawalInsertError } = await adminClient
      .from("user_withdrawals")
      .insert({
        user_id: user.id,
        email_snapshot: emailSnapshot,
        reason_type: reasonType,
        reason_detail: reasonDetail || null,
        plan_type_snapshot: planTypeSnapshot,
        credit_snapshot: creditSnapshot,
        status: "completed",
      });

    if (withdrawalInsertError) {
      throw withdrawalInsertError;
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        is_active: false,
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account withdrawal completed",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[withdraw-account] failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});