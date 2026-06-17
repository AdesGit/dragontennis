"use node";

// Why: axios requires Node.js runtime. All DB access goes through internal.legrandDb.*
// (queries/mutations cannot live in a "use node" file — Convex constraint).
import { v } from "convex/values";
import axios from "axios";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const NETATMO = "https://api.netatmo.com";
const SAFETY_MARGIN_MS = 60 * 1000;
const RETRYABLE = new Set([429, 502, 503, 504]);

function dryRun() {
  return !process.env.NETATMO_CLIENT_ID;
}

// Operator bootstrap — inserts the initial refresh token (expired access token
// forces an immediate refresh on first real call).
export const seedLegrandToken = internalAction({
  args: { refreshToken: v.string() },
  handler: async (ctx, { refreshToken }) => {
    await ctx.runMutation(internal.legrandDb.seedToken, { refreshToken });
  },
});

export const refreshToken = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (dryRun()) {
      console.log("[legrand] DRY-RUN refreshToken");
      return "dry-run-token";
    }
    const row = await ctx.runQuery(internal.legrandDb.latestToken, {});
    if (!row) throw new Error("Aucun token Legrand initial — exécuter seedLegrandToken");

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      client_id: process.env.NETATMO_CLIENT_ID!,
      client_secret: process.env.NETATMO_CLIENT_SECRET!,
    });
    const resp = await axios.post(`${NETATMO}/oauth2/token`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });
    const access = resp.data.access_token as string;
    await ctx.runMutation(internal.legrandDb.storeToken, {
      accessToken: access,
      refreshToken: (resp.data.refresh_token as string) || row.refreshToken,
      expiresIn: resp.data.expires_in as number,
    });
    return access;
  },
});

export const getValidToken = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (dryRun()) return "dry-run-token";
    const row = await ctx.runQuery(internal.legrandDb.latestToken, {});
    if (!row) throw new Error("Aucun token Legrand — exécuter seedLegrandToken");
    const expiresAt = row.obtainedAt + row.expiresIn * 1000 - SAFETY_MARGIN_MS;
    if (Date.now() < expiresAt && row.accessToken) return row.accessToken;
    return ctx.runAction(internal.legrand.refreshToken, {});
  },
});

export const netatmoSetState = internalAction({
  args: { homeId: v.string(), moduleId: v.string(), bridgeId: v.string(), on: v.boolean() },
  handler: async (ctx, { homeId, moduleId, bridgeId, on }): Promise<string> => {
    if (dryRun()) {
      console.log(`[legrand] DRY-RUN setstate module=${moduleId} on=${on}`);
      return "dry-run";
    }
    const token = await ctx.runAction(internal.legrand.getValidToken, {});
    const body = { home: { id: homeId, modules: [{ id: moduleId, on, bridge: bridgeId }] } };

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await axios.post(`${NETATMO}/api/setstate`, body, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 10000,
        });
        if (resp.data?.error || resp.data?.status !== "ok") {
          throw new Error(`Netatmo a refusé: ${JSON.stringify(resp.data)}`);
        }
        return JSON.stringify(resp.data);
      } catch (err: unknown) {
        lastErr = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const retryable =
          (status !== undefined && RETRYABLE.has(status)) ||
          (axios.isAxiosError(err) &&
            ["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "ENOTFOUND"].includes(err.code ?? ""));
        if (attempt < 2 && retryable) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr;
  },
});
