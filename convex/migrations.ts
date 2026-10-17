import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * One-shot backfill for `transactions.reason` (added in DIG-44).
 *
 * Rows written before the field existed carry no reason, so the admin history shows
 * "—" for them. This mutation infers the reason from `type`, from the presence of
 * `activationId` and, for reversals, from what the reversed transaction was.
 *
 * NOT scheduled and NOT run automatically: it rewrites production ledger rows, so it
 * must be launched by hand (and after a backup) with
 *   npx convex run migrations:backfillTransactionReasons
 * It is idempotent — rows that already have a `reason` are left untouched.
 */
type Reason = NonNullable<Doc<"transactions">["reason"]>;

function inferReason(
  tx: Doc<"transactions">,
  reversedTarget: Doc<"transactions"> | null,
): Reason {
  if (tx.type === "credit") return "credit_admin";

  if (tx.type === "debit") {
    // Extensions are the only debits that already carried a comment (+30 min).
    return tx.comment?.startsWith("Prolongation") ? "light_extension" : "light_usage";
  }

  // reversal: an automatic refund has no admin author and undoes an activation debit.
  const isAutomaticRefund = !tx.authorId && !!reversedTarget?.activationId;
  return isAutomaticRefund ? "refund_failed_activation" : "reversal";
}

export const backfillTransactionReasons = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("transactions").collect();
    const counts: Record<string, number> = {};
    let skipped = 0;

    for (const tx of all) {
      if (tx.reason) {
        skipped += 1;
        continue;
      }
      const reversedTarget = tx.reversalOf ? await ctx.db.get(tx.reversalOf) : null;
      const reason = inferReason(tx, reversedTarget);
      await ctx.db.patch(tx._id, { reason });
      counts[reason] = (counts[reason] ?? 0) + 1;
    }

    return { total: all.length, skipped, patched: counts };
  },
});
