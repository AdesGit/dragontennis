import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

// OAuth callback for "Login with Legrand". Netatmo redirects the admin's browser
// here with ?code & ?state. We validate the state nonce, exchange the code for a
// token (server-side, client_secret never leaves Convex), then bounce back to the
// admin page with a ?legrand=<result> flag for UI feedback.
http.route({
  path: "/legrand/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    const appUrl =
      process.env.APP_URL || "https://dragontennis.aidigitalassistant.cloud";
    const dest = new URL("/tokenManagementLegrand", appUrl);

    const fail = (reason: string) => {
      dest.searchParams.set("legrand", reason);
      return Response.redirect(dest.toString(), 302);
    };

    if (!code || !state) return fail("missing_code");

    const validState = await ctx.runMutation(
      internal.legrandDb.consumeOAuthState,
      { state },
    );
    if (!validState) return fail("bad_state");

    try {
      await ctx.runAction(internal.legrand.exchangeCode, { code });
    } catch {
      return fail("exchange_failed");
    }

    dest.searchParams.set("legrand", "success");
    return Response.redirect(dest.toString(), 302);
  }),
});

export default http;
