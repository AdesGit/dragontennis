import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
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

http.route({
  path: "/backup/export",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = (await request.json()) as { backupSecret?: string };
      const snapshot = await ctx.runQuery(api.backup.exportData, {
        backupSecret: body.backupSecret,
      });
      return Response.json(snapshot);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Erreur export backup" },
        { status: 400 },
      );
    }
  }),
});

http.route({
  path: "/backup/import",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = (await request.json()) as {
        backupSecret?: string;
        snapshot?: unknown;
        dryRun?: boolean;
      };
      const summary = await ctx.runMutation(api.backup.importData, {
        backupSecret: body.backupSecret,
        snapshot: body.snapshot,
        dryRun: body.dryRun ?? true,
      });
      return Response.json(summary);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Erreur import backup" },
        { status: 400 },
      );
    }
  }),
});

export default http;
