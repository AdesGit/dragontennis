#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const nodemailer = require("nodemailer");

const DEFAULT_RECIPIENT = "christian.gall@gmail.com";
const DEFAULT_RETENTION_DAYS = 31;
const DEFAULT_EMAIL_FREQUENCY = "weekly";
const DEFAULT_EMAIL_WEEKDAY = 1; // Monday, using JS Date.getDay(): 0=Sunday, 1=Monday.

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

function usage() {
  console.log(`Usage:
  node scripts/backup-cron.cjs [--force-email] [--no-email] [--help]

Daily cron orchestrator:
  1. Exports a Convex backup JSON into BACKUP_DIR.
  2. Sends the generated file by email when BACKUP_EMAIL_FREQUENCY says so.
  3. Purges local backup files older than BACKUP_RETENTION_DAYS.

Environment:
  BACKUP_DIR=backups
  BACKUP_RETENTION_DAYS=31
  BACKUP_EMAIL_RECIPIENTS=christian.gall@gmail.com
  BACKUP_EMAIL_FREQUENCY=weekly      # daily | weekly | never
  BACKUP_EMAIL_WEEKDAY=1             # 0=Sunday ... 6=Saturday, used for weekly
  GMAIL_USER=...
  GMAIL_APP_PASSWORD=...
  GMAIL_FROM="Dragon Tennis <...>"
`);
}

function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function backupPath(date = new Date()) {
  const dir = process.env.BACKUP_DIR || "backups";
  return path.resolve(dir, `tennis-backup-${todayStamp(date)}.json`);
}

function runExport(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = spawnSync(process.execPath, ["scripts/convex-backup.cjs", "export", outputPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Export Convex échoué (exit ${result.status ?? "signal"}).`);
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Export terminé mais fichier absent: ${outputPath}`);
  }
}

function emailDecision(date = new Date(), args = process.argv.slice(2)) {
  if (args.includes("--force-email")) return { shouldSend: true, reason: "force-email" };
  if (args.includes("--no-email")) return { shouldSend: false, reason: "no-email flag" };

  const frequency = (process.env.BACKUP_EMAIL_FREQUENCY || DEFAULT_EMAIL_FREQUENCY).toLowerCase();
  if (["never", "none", "off", "false", "0"].includes(frequency)) {
    return { shouldSend: false, reason: `frequency=${frequency}` };
  }
  if (frequency === "daily") return { shouldSend: true, reason: "frequency=daily" };
  if (frequency === "weekly") {
    const weekday = asPositiveInt(process.env.BACKUP_EMAIL_WEEKDAY, DEFAULT_EMAIL_WEEKDAY);
    return {
      shouldSend: date.getDay() === weekday,
      reason: `frequency=weekly weekday=${weekday} today=${date.getDay()}`,
    };
  }

  throw new Error(`BACKUP_EMAIL_FREQUENCY invalide: ${frequency}. Valeurs: daily, weekly, never.`);
}

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("GMAIL_USER et GMAIL_APP_PASSWORD sont requis pour envoyer le backup par email.");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function fromAddress() {
  const user = process.env.GMAIL_USER || "padel.asdragon@gmail.com";
  return process.env.GMAIL_FROM || `Dragon Tennis <${user}>`;
}

async function sendBackupEmail(filePath, date = new Date()) {
  const recipients = process.env.BACKUP_EMAIL_RECIPIENTS || DEFAULT_RECIPIENT;
  const stats = fs.statSync(filePath);
  const sizeKb = Math.ceil(stats.size / 1024);
  const transport = getTransport();
  const subject = `Backup Convex Dragon Tennis — ${todayStamp(date)}`;
  const text = [
    "Bonjour,",
    "",
    `Le backup Convex Dragon Tennis du ${todayStamp(date)} est joint à cet email.`,
    `Fichier: ${path.basename(filePath)}`,
    `Taille: ${sizeKb} Ko`,
    "",
    "Ce message a été envoyé automatiquement par le cron de backup.",
  ].join("\n");

  const info = await transport.sendMail({
    from: fromAddress(),
    to: recipients,
    subject,
    text,
    attachments: [{ filename: path.basename(filePath), path: filePath, contentType: "application/json" }],
  });
  console.log(`[backup-email] envoyé à ${recipients} (id ${info.messageId})`);
}

function purgeOldBackups(date = new Date()) {
  const dir = path.resolve(process.env.BACKUP_DIR || "backups");
  const retentionDays = asPositiveInt(process.env.BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
  if (!fs.existsSync(dir)) return [];

  const cutoff = date.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^tennis-backup-.*\.json$/.test(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    const stat = fs.statSync(filePath);
    if (stat.mtime.getTime() < cutoff) {
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }
  }
  return removed;
}

async function main() {
  loadDotEnvLocal();
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const now = new Date();
  const outputPath = backupPath(now);
  runExport(outputPath);

  const decision = emailDecision(now, args);
  if (decision.shouldSend) {
    await sendBackupEmail(outputPath, now);
  } else {
    console.log(`[backup-email] non envoyé (${decision.reason})`);
  }

  const removed = purgeOldBackups(now);
  console.log(`[backup-purge] ${removed.length} fichier(s) supprimé(s), rétention ${asPositiveInt(process.env.BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS)} jour(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
