import { v } from "convex/values";
import { mutation, internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const courts = await ctx.db.query("courts").collect();
    return courts
      .filter((c) => c.active)
      .sort((a, b) => a.courtNumber - b.courtNumber);
  },
});

// Idempotent seed of the 3 tennis courts, mapped to the real Netatmo (Legrand) home
// "Dragontennis". Module IDs are the NLPT contactors discovered via homesdata
// (2026-06-20): court 1 = Light1gauche, 2 = Light2milieu, 3 = Light3droite. Upserts so
// re-running corrects any stale row; admins can still override via courts.upsert.
export const seedCourts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const HOME = "6a238705c1430b42a60b1bf3";
    const BRIDGE = "00:04:74:48:7a:02";
    const defaults = [
      { courtNumber: 1, label: "Court 1", moduleId: "00:04:74:00:01:25:f2:4f" },
      { courtNumber: 2, label: "Court 2", moduleId: "00:04:74:00:01:25:c1:ce" },
      { courtNumber: 3, label: "Court 3", moduleId: "00:04:74:00:01:25:e6:50" },
    ];
    for (const d of defaults) {
      const row = { ...d, bridgeId: BRIDGE, homeId: HOME, active: true };
      const existing = await ctx.db
        .query("courts")
        .withIndex("by_court", (q) => q.eq("courtNumber", d.courtNumber))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("courts", row);
      }
    }
  },
});

export const byNumber = internalQuery({
  args: { courtNumber: v.number() },
  handler: async (ctx, { courtNumber }) => {
    return ctx.db
      .query("courts")
      .withIndex("by_court", (q) => q.eq("courtNumber", courtNumber))
      .first();
  },
});

export const upsert = mutation({
  args: {
    courtNumber: v.number(),
    label: v.string(),
    moduleId: v.string(),
    bridgeId: v.string(),
    homeId: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("courts")
      .withIndex("by_court", (q) => q.eq("courtNumber", args.courtNumber))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("courts", args);
  },
});
