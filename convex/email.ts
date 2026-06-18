"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internalAction } from "./_generated/server";

// Gmail SMTP via an app password (GMAIL_USER + GMAIL_APP_PASSWORD). Returns null when
// creds are absent so callers can fall back to logging (local dev / unconfigured).
function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, ""); // app passwords are shown in 4-char groups
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function fromAddress() {
  const user = process.env.GMAIL_USER ?? "padel.asdragon@gmail.com";
  return process.env.GMAIL_FROM ?? `Dragon Tennis <${user}>`;
}

export const sendInvite = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }) => {
    const appUrl = process.env.APP_URL ?? "http://localhost:3001";
    const link = `${appUrl}/accept-invite/${token}`;

    const transport = getTransport();
    if (!transport) {
      // Fallback: no SMTP configured — log the link so the flow stays testable.
      console.log(`[invite] (no SMTP creds) lien pour ${email}: ${link}`);
      return;
    }

    const html = `<p>Bonjour,</p>
<p>Vous avez été invité à rejoindre l'application Dragon Tennis.</p>
<p><a href="${link}">Cliquez ici pour définir votre mot de passe</a> (lien valable 7 jours).</p>`;

    const info = await transport.sendMail({
      from: fromAddress(),
      to: email,
      subject: "Votre invitation — Dragon Tennis",
      text: `Vous avez été invité à rejoindre Dragon Tennis.\nDéfinissez votre mot de passe : ${link}\n(Lien valable 7 jours.)`,
      html,
    });
    console.log(`[invite] email envoyé à ${email} (id ${info.messageId})`);
  },
});

// Why: sendVerificationRequest in ResetEmail.ts runs in the Convex V8 runtime (imported by
// auth.ts), where nodemailer's Node.js built-ins are unavailable. This action runs in the
// Node.js runtime ("use node") and is called via ctx.runAction from the V8-safe ResetEmail.
export const sendResetCode = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }) => {
    const appUrl = process.env.APP_URL ?? "http://localhost:3001";
    // The code travels in the link so the user only types a new password on /reset-password.
    const link = `${appUrl}/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(token)}`;

    const transport = getTransport();
    if (!transport) {
      console.log(`[reset] (no SMTP creds) lien pour ${email}: ${link}`);
      return;
    }

    const html = `<p>Bonjour,</p>
<p>Pour réinitialiser votre mot de passe Dragon Tennis, cliquez sur le lien ci-dessous (valable 15 minutes) :</p>
<p><a href="${link}">Réinitialiser mon mot de passe</a></p>
<p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copiez ce lien : ${link}</p>`;

    const info = await transport.sendMail({
      from: fromAddress(),
      to: email,
      subject: "Réinitialisation — Dragon Tennis",
      text: `Pour réinitialiser votre mot de passe Dragon Tennis, ouvrez ce lien (valable 15 minutes) :\n${link}`,
      html,
    });
    console.log(`[reset] email envoyé à ${email} (id ${info.messageId})`);
  },
});
