import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
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

// Idempotent seed of the 3 tennis courts. Module IDs are PLACEHOLDERS shared from the
// padel Netatmo home — the real tennis court module IDs must be set by an admin via
// courts.upsert (or here) once known. homeId/bridgeId default to padel's values.
export const seedCourts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const HOME = "66d96885a841f16b310e468f";
    const BRIDGE = "00:04:74:44:8e:24";
    const defaults = [
      { courtNumber: 1, label: "Court 1", moduleId: "PLACEHOLDER_COURT1" },
      { courtNumber: 2, label: "Court 2", moduleId: "PLACEHOLDER_COURT2" },
      { courtNumber: 3, label: "Court 3", moduleId: "PLACEHOLDER_COURT3" },
    ];
    for (const d of defaults) {
      const existing = await ctx.db
        .query("courts")
        .withIndex("by_court", (q) => q.eq("courtNumber", d.courtNumber))
        .first();
      if (existing) continue;
      await ctx.db.insert("courts", {
        courtNumber: d.courtNumber,
        label: d.label,
        moduleId: d.moduleId,
        bridgeId: BRIDGE,
        homeId: HOME,
        active: true,
      });
    }
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
