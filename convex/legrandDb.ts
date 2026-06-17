// Why: Convex "use node" files may only define actions. Queries and mutations
// that back legrand.ts live here in the default V8 runtime.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
