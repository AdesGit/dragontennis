// Why: Convex "use node" files may only define actions. Queries and mutations
// that back legrand.ts live here in the default V8 runtime.
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAdmin } from "./users";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Last 6 chars only — enough to confirm a value is present without leaking it.
function preview(value: string): string {
  return value ? `…${value.slice(-6)}` : "";
}

export const latestToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("legrandTokens").collect();
    rows.sort((a, b) => b.obtainedAt - a.obtainedAt);
    return rows[0] ?? null;
  },
});

export const storeToken = internalMutation({
  args: { accessToken: v.string(), refreshToken: v.string(), expiresIn: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("legrandTokens", { ...args, obtainedAt: Date.now() });
  },
});

// Why: seed uses obtainedAt:0 so the first getValidToken forces a real refresh.
export const seedToken = internalMutation({
  args: { refreshToken: v.string() },
  handler: async (ctx, { refreshToken }) => {
    await ctx.db.insert("legrandTokens", {
      accessToken: "",
      refreshToken,
      expiresIn: 0,
      obtainedAt: 0,
    });
  },
});

// Admin-facing read: masked status of the current Legrand token (for the
// tokenManagementLegrand page). Never returns full token values.
export const tokenStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("legrandTokens").collect();
    rows.sort((a, b) => b.obtainedAt - a.obtainedAt);
    const row = rows[0] ?? null;
    const dryRun = !process.env.NETATMO_CLIENT_ID;
    if (!row) return { dryRun, hasToken: false as const };
    const expiresAt = row.obtainedAt + row.expiresIn * 1000;
    return {
      dryRun,
      hasToken: true as const,
      obtainedAt: row.obtainedAt,
      expiresAt,
      isExpired: Date.now() >= expiresAt,
      hasAccessToken: row.accessToken.length > 0,
      accessTokenPreview: preview(row.accessToken),
      refreshTokenPreview: preview(row.refreshToken),
    };
  },
});

export const clearTokens = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("legrandTokens").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

export const createOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    await ctx.db.insert("legrandOAuthStates", { state, createdAt: Date.now() });
  },
});

// Validates and removes a state nonce (single use). Also prunes expired nonces.
export const consumeOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const now = Date.now();
    const all = await ctx.db.query("legrandOAuthStates").collect();
    let valid = false;
    for (const row of all) {
      if (row.state === state) {
        valid = now - row.createdAt < OAUTH_STATE_TTL_MS;
        await ctx.db.delete(row._id);
      } else if (now - row.createdAt >= OAUTH_STATE_TTL_MS) {
        await ctx.db.delete(row._id);
      }
    }
    return valid;
  },
});
