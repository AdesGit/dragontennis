import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { requireAdmin } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("faqEntries").collect();
    return entries.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: { question: v.string(), answer: v.string(), order: v.number(), category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.insert("faqEntries", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("faqEntries"),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, rest);
  },
});

export const remove = mutation({
  args: { id: v.id("faqEntries") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
  },
});

export const seedFaq = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("faqEntries").first();
    if (existing) return; // idempotent
    const entries = [
      {
        order: 1,
        category: "Lumières",
        question: "Comment allumer la lumière d'un court ?",
        answer:
          "Depuis « Activer une lumière », choisissez le court et la durée (30 min ou 1 h). " +
          "Le montant est débité de votre solde et la lumière s'allume. Elle s'éteint automatiquement à la fin.",
      },
      {
        order: 2,
        category: "Crédits",
        question: "Comment fonctionnent les crédits ?",
        answer:
          "Votre compte dispose d'un solde en XPF. Chaque activation débite : 250 XPF pour 30 min, 500 XPF pour 1 h. " +
          "Si le solde est insuffisant, la lumière ne s'allume pas.",
      },
      {
        order: 3,
        category: "Recharge",
        question: "Comment recharger mon compte ?",
        answer:
          "Effectuez un virement bancaire sur le compte du club en indiquant vos nom et prénom. " +
          "Un administrateur crédite ensuite votre solde dans l'application.",
      },
      {
        order: 4,
        category: "Abonnements",
        question: "Comment payer mon abonnement ?",
        answer:
          "Les abonnements se règlent auprès du bureau du club. Contactez un administrateur pour les modalités.",
      },
      {
        order: 5,
        category: "Général",
        question: "Une activation a échoué mais j'ai été débité ?",
        answer:
          "En cas d'échec d'allumage, votre compte est automatiquement recrédité. " +
          "Si le solde ne revient pas, contactez un administrateur.",
      },
    ];
    for (const e of entries) await ctx.db.insert("faqEntries", e);
  },
});
