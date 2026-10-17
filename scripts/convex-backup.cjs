#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("node:fs");
const path = require("node:path");

function loadDotEnvLocal() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const key = match[1];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

function usage() {
  console.log(`Usage:
  BACKUP_ADMIN_SECRET=... node scripts/convex-backup.cjs export [output.json]
  BACKUP_ADMIN_SECRET=... node scripts/convex-backup.cjs import <backup.json> [--apply]

Default import mode is dry-run. Pass --apply to write changes.
The script calls NEXT_PUBLIC_CONVEX_URL HTTP endpoints directly; it does not need CONVEX_DEPLOYMENT.`);
}

function convexHttpUrl(route) {
  const base = process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL ou CONVEX_SITE_URL est requis dans .env.local");
  }
  return new URL(route, base.endsWith("/") ? base : `${base}/`).toString();
}

async function postJson(route, body) {
  const response = await fetch(convexHttpUrl(route), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Réponse non-JSON (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(data && data.error ? data.error : `HTTP ${response.status}`);
  }
  return data;
}

async function main() {
  const [, , command, fileArg, maybeApply] = process.argv;
  const backupSecret = process.env.BACKUP_ADMIN_SECRET;
  if (!backupSecret) {
    console.error("Erreur: BACKUP_ADMIN_SECRET est requis pour le CLI.");
    usage();
    process.exit(1);
  }

  if (command === "export") {
    const outputPath = fileArg || `backups/tennis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const data = await postJson("backup/export", { backupSecret });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Backup écrit: ${path.resolve(outputPath)}`);
    console.log(`Tables: ${Object.entries(data.tables).map(([name, rows]) => `${name}=${rows.length}`).join(", ")}`);
  } else if (command === "import") {
    if (!fileArg) {
      usage();
      process.exit(1);
    }
    const dryRun = maybeApply !== "--apply";
    const snapshot = JSON.parse(fs.readFileSync(fileArg, "utf8"));
    const summary = await postJson("backup/import", { backupSecret, snapshot, dryRun });
    console.log(JSON.stringify(summary, null, 2));
    if (dryRun) console.log("Dry-run seulement. Relancez avec --apply pour appliquer l'import.");
  } else {
    usage();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
