import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const role = v.union(v.literal("admin"), v.literal("user"));

export default defineSchema({
  ...authTables,

  users: defineTable({
    // Convex Auth may set these:
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    // App fields:
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(role),
    balance: v.optional(v.number()),
    status: v.optional(v.union(v.literal("invited"), v.literal("active"))),
    createdAt: v.optional(v.number()),
  }).index("email", ["email"]),

  invites: defineTable({
    email: v.string(),
    token: v.string(),
    role,
    firstName: v.string(),
    lastName: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"]),

  // ---- Reserved for Phase 2/3 (defined now for a stable schema) ----
  transactions: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("credit"), v.literal("debit"), v.literal("reversal")),
    amount: v.number(),
    balanceBefore: v.number(),
    balanceAfter: v.number(),
    comment: v.optional(v.string()),
    authorId: v.optional(v.id("users")),
    court: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    activationId: v.optional(v.id("activations")),
    reversalOf: v.optional(v.id("transactions")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_reversal", ["reversalOf"]),

  activations: defineTable({
    userId: v.id("users"),
    court: v.number(),
    durationMin: v.number(),
    amount: v.number(),
    status: v.union(
      v.literal("pending"), v.literal("active"),
      v.literal("used"), v.literal("failed"),
    ),
    startTime: v.number(),
    endTime: v.number(),
    netatmoResponse: v.optional(v.string()),
    transactionId: v.optional(v.id("transactions")),
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

  legrandTokens: defineTable({
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
    obtainedAt: v.number(),
  }),

  courts: defineTable({
    courtNumber: v.number(),
    label: v.string(),
    moduleId: v.string(),
    bridgeId: v.string(),
    homeId: v.string(),
    active: v.boolean(),
  }).index("by_court", ["courtNumber"]),

  faqEntries: defineTable({
    question: v.string(),
    answer: v.string(),
    order: v.number(),
    category: v.optional(v.string()),
  }),
});
