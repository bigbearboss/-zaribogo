export default {
  async fetch(request, env, ctx) {
    return new Response(
      JSON.stringify(
        {
          success: true,
          message: "Worker is alive",
          url: request.url,
          time: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  },

  async scheduled(controller, env, ctx) {
    console.log("cron triggered");
  },
};