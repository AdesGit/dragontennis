import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const BACKUP_VERSION = 1;
const APP_TABLES = ["users", "invites", "transactions", "activations", "courts", "faqEntries"] as const;

type AppTable = (typeof APP_TABLES)[number];
type BackupTables = Record<AppTable, Record<string, unknown>[]>;

type ImportSummary = {
  dryRun: boolean;
  version: number;
  tables: Record<AppTable, { incoming: number; created: number; updated: number; skipped: number }>;
  warnings: string[];
};

function emptySummary(dryRun: boolean, version: number): ImportSummary {
  return {
    dryRun,
    version,
    tables: Object.fromEntries(
      APP_TABLES.map((table) => [table, { incoming: 0, created: 0, updated: 0, skipped: 0 }]),
    ) as ImportSummary["tables"],
    warnings: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function roleValue(value: unknown): "admin" | "user" | undefined {
  return value === "admin" || value === "user" ? value : undefined;
}

function userStatusValue(value: unknown): "invited" | "active" | undefined {
  return value === "invited" || value === "active" ? value : undefined;
}

function transactionTypeValue(value: unknown): "credit" | "debit" | "reversal" {
  return value === "credit" || value === "debit" || value === "reversal" ? value : "credit";
}

function activationStatusValue(value: unknown): "pending" | "active" | "used" | "failed" {
  return value === "pending" || value === "active" || value === "used" || value === "failed" ? value : "used";
}

async function requireBackupAccess(ctx: QueryCtx | MutationCtx, backupSecret?: string) {
  const configuredSecret = process.env.BACKUP_ADMIN_SECRET;
  if (configuredSecret && backupSecret && backupSecret === configuredSecret) return;

  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié");
  const me = await ctx.db.get(userId);
  if (!me || me.role !== "admin") throw new Error("Accès réservé à l'administrateur");
}

function readTables(snapshot: unknown): { version: number; tables: BackupTables } {
  if (!isRecord(snapshot)) throw new Error("Backup invalide: objet JSON attendu");
  const version = numberValue(snapshot.version);
  if (version !== BACKUP_VERSION) {
    throw new Error(`Version backup non supportée: ${String(snapshot.version)} (attendu: ${BACKUP_VERSION})`);
  }
  const rawTables = snapshot.tables;
  if (!isRecord(rawTables)) throw new Error("Backup invalide: propriété tables manquante");

  return {
    version,
    tables: Object.fromEntries(
      APP_TABLES.map((table) => [table, asRecordArray(rawTables[table])]),
    ) as BackupTables,
  };
}

export const exportData = query({
  args: { backupSecret: v.optional(v.string()) },
  handler: async (ctx, { backupSecret }) => {
    await requireBackupAccess(ctx, backupSecret);

    const [users, invites, transactions, activations, courts, faqEntries] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("invites").collect(),
      ctx.db.query("transactions").collect(),
      ctx.db.query("activations").collect(),
      ctx.db.query("courts").collect(),
      ctx.db.query("faqEntries").collect(),
    ]);

    return {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      tables: { users, invites, transactions, activations, courts, faqEntries },
    };
  },
});

export const importData = mutation({
  args: {
    snapshot: v.any(),
    dryRun: v.boolean(),
    backupSecret: v.optional(v.string()),
  },
  handler: async (ctx, { snapshot, dryRun, backupSecret }) => {
    await requireBackupAccess(ctx, backupSecret);
    const { version, tables } = readTables(snapshot);
    const summary = emptySummary(dryRun, version);

    for (const table of APP_TABLES) {
      summary.tables[table].incoming = tables[table].length;
    }

    const userIdMap = new Map<string, string>();
    for (const row of tables.users) {
      const email = stringValue(row.email);
      const originalId = stringValue(row._id);
      const existing = email
        ? await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first()
        : null;
      const patch = cleanUndefined({
        name: stringValue(row.name),
        email,
        emailVerificationTime: numberValue(row.emailVerificationTime),
        image: stringValue(row.image),
        isAnonymous: booleanValue(row.isAnonymous),
        firstName: stringValue(row.firstName),
        lastName: stringValue(row.lastName),
        role: roleValue(row.role),
        balance: numberValue(row.balance),
        status: userStatusValue(row.status),
        createdAt: numberValue(row.createdAt),
      });

      if (existing) {
        summary.tables.users.updated += 1;
        if (!dryRun) await ctx.db.patch(existing._id, patch);
        if (originalId) userIdMap.set(originalId, existing._id);
      } else if (email) {
        summary.tables.users.created += 1;
        if (!dryRun) {
          const newId = await ctx.db.insert("users", patch);
          if (originalId) userIdMap.set(originalId, newId);
        }
      } else {
        summary.tables.users.skipped += 1;
        summary.warnings.push("Utilisateur ignoré: email manquant, impossible de faire un upsert fiable");
      }
    }

    for (const row of tables.courts) {
      const courtNumber = numberValue(row.courtNumber);
      if (courtNumber === undefined) {
        summary.tables.courts.skipped += 1;
        continue;
      }
      const existing = await ctx.db.query("courts").withIndex("by_court", (q) => q.eq("courtNumber", courtNumber)).first();
      const patch = cleanUndefined({
        courtNumber,
        label: stringValue(row.label) ?? `Court ${courtNumber}`,
        moduleId: stringValue(row.moduleId) ?? "",
        bridgeId: stringValue(row.bridgeId) ?? "",
        homeId: stringValue(row.homeId) ?? "",
        active: booleanValue(row.active) ?? true,
      });
      if (existing) {
        summary.tables.courts.updated += 1;
        if (!dryRun) await ctx.db.patch(existing._id, patch);
      } else {
        summary.tables.courts.created += 1;
        if (!dryRun) await ctx.db.insert("courts", patch);
      }
    }

    for (const row of tables.faqEntries) {
      const question = stringValue(row.question);
      if (!question) {
        summary.tables.faqEntries.skipped += 1;
        continue;
      }
      const allFaq = await ctx.db.query("faqEntries").collect();
      const existing = allFaq.find((f) => f.question === question);
      const patch = cleanUndefined({
        question,
        answer: stringValue(row.answer) ?? "",
        order: numberValue(row.order) ?? 0,
        category: stringValue(row.category),
      });
      if (existing) {
        summary.tables.faqEntries.updated += 1;
        if (!dryRun) await ctx.db.patch(existing._id, patch);
      } else {
        summary.tables.faqEntries.created += 1;
        if (!dryRun) await ctx.db.insert("faqEntries", patch);
      }
    }

    for (const row of tables.invites) {
      const token = stringValue(row.token);
      const email = stringValue(row.email);
      if (!token || !email) {
        summary.tables.invites.skipped += 1;
        continue;
      }
      const existing = await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", token)).first();
      const patch = cleanUndefined({
        email,
        token,
        role: roleValue(row.role) ?? "user",
        firstName: stringValue(row.firstName) ?? "",
        lastName: stringValue(row.lastName) ?? "",
        expiresAt: numberValue(row.expiresAt) ?? Date.now(),
        used: booleanValue(row.used) ?? false,
      });
      if (existing) {
        summary.tables.invites.updated += 1;
        if (!dryRun) await ctx.db.patch(existing._id, patch);
      } else {
        summary.tables.invites.created += 1;
        if (!dryRun) await ctx.db.insert("invites", patch);
      }
    }

    // Transactions and activations are append-only history. In merge mode, keep existing rows
    // and only import rows whose _id is absent; recreated rows get new Convex IDs.
    for (const row of tables.transactions) {
      const originalId = stringValue(row._id);
      if (originalId) {
        const existing = await ctx.db.get(originalId as never);
        if (existing) {
          summary.tables.transactions.updated += 1;
          continue;
        }
      }
      const originalUserId = stringValue(row.userId);
      const mappedUserId = originalUserId ? userIdMap.get(originalUserId) ?? originalUserId : undefined;
      if (!mappedUserId) {
        summary.tables.transactions.skipped += 1;
        summary.warnings.push("Transaction ignorée: userId manquant");
        continue;
      }
      const transaction = cleanUndefined({
        userId: mappedUserId,
        type: row.type === "credit" || row.type === "debit" || row.type === "reversal" ? row.type : "credit",
        amount: numberValue(row.amount) ?? 0,
        balanceBefore: numberValue(row.balanceBefore) ?? 0,
        balanceAfter: numberValue(row.balanceAfter) ?? 0,
        comment: stringValue(row.comment),
        authorId: stringValue(row.authorId),
        court: numberValue(row.court),
        durationMin: numberValue(row.durationMin),
        activationId: stringValue(row.activationId),
        reversalOf: stringValue(row.reversalOf),
        createdAt: numberValue(row.createdAt) ?? Date.now(),
      });
      summary.tables.transactions.created += 1;
      if (!dryRun) await ctx.db.insert("transactions", transaction as never);
    }

    for (const row of tables.activations) {
      const originalId = stringValue(row._id);
      if (originalId) {
        const existing = await ctx.db.get(originalId as never);
        if (existing) {
          summary.tables.activations.updated += 1;
          continue;
        }
      }
      const originalUserId = stringValue(row.userId);
      const mappedUserId = originalUserId ? userIdMap.get(originalUserId) ?? originalUserId : undefined;
      if (!mappedUserId) {
        summary.tables.activations.skipped += 1;
        summary.warnings.push("Activation ignorée: userId manquant");
        continue;
      }
      const activation = cleanUndefined({
        userId: mappedUserId,
        court: numberValue(row.court) ?? 0,
        durationMin: numberValue(row.durationMin) ?? 0,
        amount: numberValue(row.amount) ?? 0,
        status:
          row.status === "pending" || row.status === "active" || row.status === "used" || row.status === "failed"
            ? row.status
            : "used",
        startTime: numberValue(row.startTime) ?? Date.now(),
        endTime: numberValue(row.endTime) ?? Date.now(),
        netatmoResponse: stringValue(row.netatmoResponse),
        transactionId: stringValue(row.transactionId),
      });
      summary.tables.activations.created += 1;
      if (!dryRun) await ctx.db.insert("activations", activation as never);
    }

    if (dryRun) {
      summary.warnings.push("Dry-run uniquement: aucune donnée n'a été modifiée.");
    }
    summary.warnings.push(
      "Merge/upsert: utilisateurs par email, courts par numéro, FAQ par question, invites par token. L'historique transactions/activations est conservé s'il existe déjà, sinon recréé avec de nouveaux IDs Convex.",
    );

    return summary;
  },
});
