# Dragon Tennis — Phase 1 : Infra + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a brand-new Next.js + Convex app on its own dedicated Convex Docker instance where an admin can invite a member by email, the member sets a password through the invite link, and signs in — with public sign-up disabled and route protection in place.

**Architecture:** Next.js 15 (App Router) frontend + Convex self-hosted backend in a dedicated Docker container (`convex-tennis`, ports 3220/3221), Convex Auth Password provider. Invite-only signup is enforced in the `createOrUpdateUser` auth callback: a new account is only created if an unused `invites` row exists for that email; the callback stamps role/balance and marks the invite used in one atomic mutation.

**Tech Stack:** Next.js `15.3.6`, React `18.3.1`, TypeScript `5`, Tailwind CSS `3.4.x`, Convex `1.34.x`, `@convex-dev/auth` `0.0.91`, `@auth/core` `0.37.4`, `jose` (key generation), `nodemailer` (invite emails).

## Global Constraints

Every task implicitly inherits these (copied verbatim from the spec / sibling-project rules):

- **No `any` types.** Use proper types or `unknown` + type guards.
- **Tailwind utility classes only** — never `style={{}}` inline styles.
- **Every Convex function arg uses an explicit `v` validator.**
- **Public Convex functions check auth** via `getAuthUserId(ctx)`; internal functions skip auth (agent/cron only).
- **`convex/auth.config.ts` uses `||` not `??`** for the `CONVEX_SITE_URL` fallback (empty string during CLI deploy → `iss:""` → `NoAuthProvider` if `??`).
- **Inside `httpAction` handlers, call `internal.*` never `api.*`.**
- **Dedicated instance only:** ports `127.0.0.1:3220` (sync) / `3221` (http actions). Never reuse LifeLup's `convex-backend` (3210/3211).
- **Secrets are regenerated for Tennis** — never reuse LifeLup/padel `JWT_PRIVATE_KEY`, `JWKS`, `AGENT_SECRET`, SMTP creds verbatim without intent.
- **When adding a new `convex/*.ts` module, update `convex/_generated/api.d.ts` manually** (3-step process) before `npm run build`. `npx convex deploy` regenerates it server-side, but the local committed copy is what `npm run build` reads.

**Testing approach (read before starting):** This project has **no unit-test runner** (MVP phase, mirrors sibling project LifeLup). Each task's verification = the real validation gates: `npm run build` (zero TS errors), `npm run lint` (zero warnings), `npx convex deploy` (schema validates), targeted `curl` / `npx convex run`, and a manual behavioral check. "Run to verify it fails" steps are framed against these gates.

**EXECUTION SCOPE — local-only (decided with the operator):** This run provisions the Convex
instance **bound to localhost** and defers all public exposure. Concretely:
- Task 2 brings up the `convex-tennis` container and verifies via `http://127.0.0.1:3220/3221` (no DNS needed).
- `npx convex deploy` targets `http://127.0.0.1:3220` throughout — this validates the schema and
  generates `convex/_generated`, so `npm run build` type-checks fully.
- **Browser-based auth E2E is deferred.** Convex Auth's JWT issuer must be a reachable public
  `https` domain (JWKS fetch), which requires the DNS records + TLS that don't exist yet. So for
  Tasks 4 and 7, runtime sign-in / accept-invite **in a browser is verified later**, during the
  public-deploy pass. Their per-task gates here are: build + lint clean, schema/functions deploy,
  and data-level checks via `npx convex run` (e.g. `seedAdminInvite`, `getInviteByToken`).
- **Task 8 Steps 6–7 (Nginx vhost, certbot, PM2 prod, browser smoke test) are DEFERRED** to a
  separate supervised pass after the operator creates the two DNS A records
  (`tennis` + `convex-tennis` → `72.62.129.117`). In this run, Task 8 only writes/commits the
  `ecosystem.config.cjs` and `deploy/nginx-tennis.conf` files and verifies route protection via
  `npm run build`/`npm run lint` (the `AuthGate` redirect is exercised in the deferred browser pass).

**Convex CLI env (used in every `npx convex *` command below).** Export once per shell session on the VPS:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
```

---

### Task 1: Scaffold the Next.js 15 + TypeScript + Tailwind app

**Files:**
- Create: `/home/claude/dev/tennis/package.json`
- Create: `/home/claude/dev/tennis/tsconfig.json`
- Create: `/home/claude/dev/tennis/next.config.mjs`
- Create: `/home/claude/dev/tennis/postcss.config.mjs`
- Create: `/home/claude/dev/tennis/tailwind.config.ts`
- Create: `/home/claude/dev/tennis/.eslintrc.json`
- Create: `/home/claude/dev/tennis/app/globals.css`
- Create: `/home/claude/dev/tennis/app/layout.tsx`
- Create: `/home/claude/dev/tennis/app/page.tsx`
- Create: `/home/claude/dev/tennis/.env.example`

**Interfaces:**
- Consumes: nothing (greenfield).
- Produces: a buildable Next.js app. Later tasks add `components/`, `convex/`, and more `app/` routes.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dragon-tennis",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint",
    "convex:dev": "convex dev"
  },
  "dependencies": {
    "@auth/core": "0.37.4",
    "@convex-dev/auth": "^0.0.91",
    "convex": "^1.34.0",
    "next": "15.3.6",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.4.20",
    "eslint": "^8",
    "eslint-config-next": "15.3.6",
    "googleapis": "^161.0.0",
    "jose": "^5.9.6",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.3",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`.eslintrc.json`:
```json
{ "extends": "next/core-web-vitals" }
```

`.env.example`:
```
# Public Convex URL the browser connects to (tennis dedicated instance)
NEXT_PUBLIC_CONVEX_URL=https://convex-tennis.aidigitalassistant.cloud
```

- [ ] **Step 3: Create the root layout, global styles, and a placeholder home page**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dragon Tennis",
  description: "Gestion des lumières — A.S. Dragon Tennis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Dragon Tennis — en construction</h1>
    </main>
  );
}
```

- [ ] **Step 4: Install dependencies and verify the build passes**

Run:
```bash
cd /home/claude/dev/tennis && npm install && npm run build && npm run lint
```
Expected: `npm install` succeeds, `npm run build` ends with "Compiled successfully" and a route table listing `/`, `npm run lint` prints "No ESLint warnings or errors".

- [ ] **Step 5: Commit**

```bash
cd /home/claude/dev/tennis
git add -A
git commit -m "feat: scaffold Next.js 15 + TS + Tailwind app shell"
```

---

### Task 2: Provision the dedicated Convex Docker instance + auth keys

**Files:**
- Create: `/home/claude/dev/tennis/deploy/convex-tennis/docker-compose.yml`
- Create: `/home/claude/dev/tennis/deploy/convex-tennis/.env.example`
- Create: `/home/claude/dev/tennis/scripts/generateKeys.mjs`
- Create (NOT committed — gitignored): `/home/claude/dev/tennis/.env.local`

**Interfaces:**
- Consumes: nothing.
- Produces: a running `convex-tennis` container reachable at `http://127.0.0.1:3220`, with `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` set in its runtime env. Later tasks deploy Convex functions into it.

- [ ] **Step 1: Write the committed deploy templates**

`deploy/convex-tennis/docker-compose.yml`:
```yaml
version: "3.8"

services:
  convex-tennis:
    image: ghcr.io/get-convex/convex-backend:latest
    container_name: convex-tennis
    restart: unless-stopped
    ports:
      - "127.0.0.1:3220:3210"   # sync engine
      - "127.0.0.1:3221:3211"   # http actions
    volumes:
      - /opt/convex-tennis/data:/convex/data
      - /opt/convex-tennis/logs:/convex/logs
    env_file:
      - /opt/convex-tennis/.env
    environment:
      - PORT=3210
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3210/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

`deploy/convex-tennis/.env.example`:
```
INSTANCE_NAME=convex-tennis
INSTANCE_SECRET=__GENERATE_A_UNIQUE_SECRET__
RUST_LOG=info
CONVEX_CLOUD_ORIGIN=https://convex-tennis.aidigitalassistant.cloud
CONVEX_SITE_ORIGIN=https://convex-tennis.aidigitalassistant.cloud
```

- [ ] **Step 2: Create the real instance dir + env on the VPS, and bring the container up**

Run:
```bash
sudo mkdir -p /opt/convex-tennis/data /opt/convex-tennis/logs
# Generate a unique instance secret:
INSTANCE_SECRET=$(openssl rand -hex 32)
sudo tee /opt/convex-tennis/.env >/dev/null <<EOF
INSTANCE_NAME=convex-tennis
INSTANCE_SECRET=$INSTANCE_SECRET
RUST_LOG=info
CONVEX_CLOUD_ORIGIN=https://convex-tennis.aidigitalassistant.cloud
CONVEX_SITE_ORIGIN=https://convex-tennis.aidigitalassistant.cloud
EOF
sudo cp /home/claude/dev/tennis/deploy/convex-tennis/docker-compose.yml /opt/convex-tennis/docker-compose.yml
cd /opt/convex-tennis && sudo docker compose up -d
```

- [ ] **Step 3: Verify the container is healthy and the sync port answers**

Run:
```bash
docker ps --filter name=convex-tennis --format '{{.Names}} {{.Status}}'
curl -s http://127.0.0.1:3220/api/health && echo OK
```
Expected: container listed `Up ... (healthy)` (allow ~40s for the healthcheck), and the curl prints a body followed by `OK`. If still `unhealthy` after a minute but `/api/health` returns 200, that matches the known-cosmetic healthcheck quirk on the LifeLup instance — proceed.

- [ ] **Step 4: Write the RS256 key generator and produce the auth keys**

`scripts/generateKeys.mjs`:
```js
// Generates the RS256 keypair Convex Auth needs for self-hosted JWT signing.
// JWT_PRIVATE_KEY must be single-line (newlines -> spaces); JWKS is the public set.
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

console.log("JWT_PRIVATE_KEY=" + privateKey.trimEnd().replace(/\n/g, " "));
console.log("JWKS=" + jwks);
```

Run:
```bash
cd /home/claude/dev/tennis && node scripts/generateKeys.mjs
```
Expected: two lines printed — `JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY----- ...` (single line) and `JWKS={"keys":[{"use":"sig",...}]}`.

- [ ] **Step 5: Set the Convex runtime env vars on the tennis instance**

⚠️ **Generate the keys ONCE.** Running `generateKeys.mjs` separately per `env set` would produce a
**mismatched** private key / JWKS pair (different keypair each run) → auth silently broken. Capture
one invocation's output into variables, then set all three. `SITE_URL` is the front-end app origin.
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis
# One invocation; split the two output lines into vars without printing them:
KEYS="$(node scripts/generateKeys.mjs)"
PRIV="$(printf '%s\n' "$KEYS" | sed -n 's/^JWT_PRIVATE_KEY=//p')"
JWKS_VAL="$(printf '%s\n' "$KEYS" | sed -n 's/^JWKS=//p')"
# Pipe via stdin (the "-----BEGIN" prefix breaks positional-arg parsing):
printf '%s' "$PRIV" | npx convex env set JWT_PRIVATE_KEY -
printf '%s' "$JWKS_VAL" | npx convex env set JWKS -
npx convex env set SITE_URL https://tennis.aidigitalassistant.cloud
unset KEYS PRIV JWKS_VAL
npx convex env list
```
Expected: `npx convex env list` shows `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` (values masked). The
private key and JWKS are a matched pair (same generator run).

- [ ] **Step 6: Write `.env.local` for the dev front-end (gitignored) and commit the templates**

```bash
cd /home/claude/dev/tennis
echo "NEXT_PUBLIC_CONVEX_URL=https://convex-tennis.aidigitalassistant.cloud" > .env.local
git add deploy/convex-tennis/docker-compose.yml deploy/convex-tennis/.env.example scripts/generateKeys.mjs
git commit -m "chore: dedicated convex-tennis Docker instance + auth key generator"
```
(`.env.local` is already ignored by the `.env*` rule in `.gitignore` — confirm `git status` does not list it.)

---

### Task 3: Convex schema + auth wiring (invite-gated signup)

**Files:**
- Create: `/home/claude/dev/tennis/convex/schema.ts`
- Create: `/home/claude/dev/tennis/convex/auth.ts`
- Create: `/home/claude/dev/tennis/convex/auth.config.ts`
- Create: `/home/claude/dev/tennis/convex/http.ts`

**Interfaces:**
- Consumes: the running instance from Task 2.
- Produces:
  - `users` table fields: `email`, `firstName?`, `lastName?`, `role: "admin"|"user"`, `balance: number`, `status: "invited"|"active"`, `createdAt: number`; index `email` on `["email"]`.
  - `invites` table: `email`, `token`, `role: "admin"|"user"`, `firstName`, `lastName`, `expiresAt: number`, `used: boolean`; indexes `by_email` on `["email"]`, `by_token` on `["token"]`.
  - Tables reserved for later phases: `transactions`, `activations`, `legrandTokens`, `courts`, `faqEntries` (defined now so the schema is stable; unused until Phase 2/3).
  - Exported `auth`, `signIn`, `signOut`, `store`, `isAuthenticated` from `convex/auth.ts`.

- [ ] **Step 1: Write the full schema**

`convex/schema.ts`:
```ts
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
  }).index("by_user", ["userId"]),

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
  }).index("by_status", ["status"]),

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
```

- [ ] **Step 2: Write `auth.config.ts` (note the `||`, never `??`)**

`convex/auth.config.ts`:
```ts
const authConfig = {
  providers: [
    {
      // CONVEX_SITE_URL is empty string ("") during CLI deploy — use || not ??.
      domain: process.env.CONVEX_SITE_URL || "https://convex-tennis.aidigitalassistant.cloud",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
```

- [ ] **Step 3: Write `auth.ts` with the invite-gated `createOrUpdateUser` callback**

`convex/auth.ts`:
```ts
import { Password } from "@convex-dev/auth/providers/Password";  // named export in v0.0.91 (matches LifeLup)
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    // Invite-only: a NEW account is created only if an unused, unexpired invite
    // exists for the email. Public signup is therefore impossible. The invite's
    // role/name are stamped onto the user, balance starts at 0, status active.
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId; // normal sign-in of an existing user
      }
      const email = (args.profile.email as string | undefined)?.toLowerCase();
      if (!email) throw new Error("Email requis");

      const invite = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) => q.eq(q.field("used"), false))
        .first();

      if (!invite) throw new Error("Inscription sur invitation uniquement");
      if (invite.expiresAt < Date.now()) throw new Error("Invitation expirée");

      const userId = await ctx.db.insert("users", {
        email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        role: invite.role,
        balance: 0,
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.patch(invite._id, { used: true });
      return userId;
    },
  },
});
```

- [ ] **Step 4: Write `http.ts` (auth routes are mandatory for JWKS/OIDC)**

`convex/http.ts`:
```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

- [ ] **Step 5: Deploy and verify the schema validates + the OIDC issuer is correct**

Run:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis && npx convex deploy
curl -s https://convex-tennis.aidigitalassistant.cloud/.well-known/openid-configuration
```
Expected: `npx convex deploy` reports the added tables/indexes and finishes without error. The curl returns JSON whose `"issuer"` equals `https://convex-tennis.aidigitalassistant.cloud`. (If the public URL 404s, the Nginx vhost from Task 8 isn't up yet — verify locally instead with `curl -s http://127.0.0.1:3221/.well-known/openid-configuration`.)

- [ ] **Step 6: Commit**

```bash
cd /home/claude/dev/tennis
git add convex/schema.ts convex/auth.ts convex/auth.config.ts convex/http.ts convex/_generated
git commit -m "feat(convex): schema + Convex Auth with invite-gated signup"
```

---

### Task 4: Client provider, sign-in page, and `getMe`

**Files:**
- Create: `/home/claude/dev/tennis/components/ConvexClientProvider.tsx`
- Modify: `/home/claude/dev/tennis/app/layout.tsx` (wrap children in the provider)
- Create: `/home/claude/dev/tennis/components/SignInForm.tsx`
- Create: `/home/claude/dev/tennis/app/signin/page.tsx`
- Create: `/home/claude/dev/tennis/components/SignOutButton.tsx`
- Create: `/home/claude/dev/tennis/convex/users.ts`
- Modify: `/home/claude/dev/tennis/convex/_generated/api.d.ts` (register `users` module)

**Interfaces:**
- Consumes: `auth` exports (Task 3), `NEXT_PUBLIC_CONVEX_URL` (Task 2).
- Produces:
  - `api.users.getMe` — query returning the current user doc or `null`.
  - `<ConvexClientProvider>`, `<SignInForm>`, `<SignOutButton>` components.

- [ ] **Step 1: Write `getMe` and register the module**

`convex/users.ts`:
```ts
import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.get(userId);
  },
});
```

Then update `convex/_generated/api.d.ts` (3-step manual process): add `import type * as users from "../users.js";` near the other imports, and add `users: typeof users;` to the `fullApi` declaration. (After this task's deploy the server rewrites the file, but the local copy must compile now.)

- [ ] **Step 2: Write the Convex client provider**

`components/ConvexClientProvider.tsx`:
```tsx
"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
```

- [ ] **Step 3: Wrap the app in `layout.tsx`**

Modify `app/layout.tsx` — import and wrap:
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

export const metadata: Metadata = {
  title: "Dragon Tennis",
  description: "Gestion des lumières — A.S. Dragon Tennis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Write the sign-in form and page**

`components/SignInForm.tsx`:
```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const formData = new FormData(event.currentTarget);
        formData.set("flow", "signIn");
        try {
          await signIn("password", formData);
          router.push("/");
        } catch {
          setError("Email ou mot de passe incorrect.");
          setSubmitting(false);
        }
      }}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="rounded border border-gray-300 px-3 py-2"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Mot de passe"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Connexion…" : "Se connecter"}
      </button>
      <a href="/forgot-password" className="text-center text-sm text-blue-600">
        Mot de passe oublié ?
      </a>
    </form>
  );
}
```

`app/signin/page.tsx`:
```tsx
import { SignInForm } from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Dragon Tennis</h1>
      <SignInForm />
    </main>
  );
}
```

- [ ] **Step 5: Write the sign-out button**

`components/SignOutButton.tsx`:
```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/signin");
      }}
      className="rounded px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
    >
      Déconnexion
    </button>
  );
}
```

- [ ] **Step 6: Deploy, build, and verify**

Run:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis && npx convex deploy && npm run build && npm run lint
```
Expected: deploy succeeds; build compiles with routes `/` and `/signin`; lint clean. There are no users yet, so a sign-in attempt would fail — that's expected until Task 7.

- [ ] **Step 7: Commit**

```bash
cd /home/claude/dev/tennis
git add components/ app/layout.tsx app/signin convex/users.ts convex/_generated
git commit -m "feat(auth): client provider, sign-in page, getMe query, sign-out button"
```

---

### Task 5: Admin-only member invite mutation + first-admin bootstrap

**Files:**
- Create: `/home/claude/dev/tennis/convex/members.ts`
- Modify: `/home/claude/dev/tennis/convex/users.ts` (add `requireAdmin` helper + `listMembers`)
- Modify: `/home/claude/dev/tennis/convex/_generated/api.d.ts` (register `members`)

**Interfaces:**
- Consumes: `users`, `invites` tables (Task 3); `getAuthUserId`.
- Produces:
  - `api.members.createMember({ firstName, lastName, email })` — admin-only mutation; inserts an `invites` row (`role:"user"`, 7-day expiry, random token) and **returns `{ token }`**. (Email send is wired in Task 6.)
  - `api.members.getInviteByToken({ token })` — public query returning `{ email, firstName, lastName } | null` for the accept-invite page.
  - `internal.members.seedAdminInvite({ firstName, lastName, email })` — internalMutation to bootstrap the very first admin; returns `{ token }`.
  - `api.users.listMembers()` — admin-only; returns all users.
  - `requireAdmin(ctx)` helper in `users.ts` returning the admin's userId or throwing.

- [ ] **Step 1: Add the admin guard + member listing to `users.ts`**

Append to `convex/users.ts`:
```ts
import { QueryCtx, MutationCtx } from "./_generated/server";

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié");
  const me = await ctx.db.get(userId);
  if (!me || me.role !== "admin") throw new Error("Accès réservé à l'administrateur");
  return userId;
}

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("users").collect();
  },
});
```

- [ ] **Step 2: Write `members.ts`**

`convex/members.ts`:
```ts
import { v } from "convex/values";
import { mutation, internalMutation, query, MutationCtx } from "./_generated/server";
import { requireAdmin } from "./users";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function newToken() {
  // 32 hex chars, sufficient for an invite link
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function insertInvite(
  ctx: MutationCtx,
  args: { firstName: string; lastName: string; email: string; role: "admin" | "user" },
) {
  // Normalize on insert so the lowercased lookup in auth.ts's createOrUpdateUser matches (review I-1).
  const email = args.email.toLowerCase();

  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (existingUser) throw new Error("Un compte existe déjà pour cet email");

  // Supersede any prior unused invites for this email so a stale/expired one can't shadow
  // the fresh invite via the callback's .first() lookup (review I-2).
  const priorInvites = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  for (const prior of priorInvites) {
    if (!prior.used) await ctx.db.patch(prior._id, { used: true });
  }

  const token = newToken();
  await ctx.db.insert("invites", {
    email,
    token,
    role: args.role,
    firstName: args.firstName,
    lastName: args.lastName,
    expiresAt: Date.now() + SEVEN_DAYS,
    used: false,
  });
  return token;
}

export const createMember = mutation({
  args: { firstName: v.string(), lastName: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const token = await insertInvite(ctx, { ...args, role: "user" });
    return { token };
  },
});

// Bootstrap the very first admin (no admin exists yet). Run via `npx convex run`.
export const seedAdminInvite = internalMutation({
  args: { firstName: v.string(), lastName: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const token = await insertInvite(ctx, { ...args, role: "admin" });
    return { token };
  },
});

export const getInviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!invite || invite.used || invite.expiresAt < Date.now()) return null;
    return { email: invite.email, firstName: invite.firstName, lastName: invite.lastName };
  },
});
```

Register `members` in `convex/_generated/api.d.ts` (import + `fullApi` line, same 3-step process).

- [ ] **Step 3: Deploy and verify the admin guard + bootstrap work**

Run:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis && npx convex deploy
# Bootstrap the first admin invite (replace with the real admin email):
npx convex run members:seedAdminInvite '{"firstName":"Christian","lastName":"Gall","email":"neotokyo.794@gmail.com"}'
```
Expected: deploy succeeds; the `run` prints `{ token: "<32-hex>" }`. **Save this token** — Task 7 uses it to set the admin password. Confirm the invite landed:
```bash
npx convex run members:getInviteByToken '{"token":"<paste token>"}'
```
Expected: `{ email: "neotokyo.794@gmail.com", firstName: "Christian", lastName: "Gall" }`.

- [ ] **Step 4: Commit**

```bash
cd /home/claude/dev/tennis
git add convex/members.ts convex/users.ts convex/_generated
git commit -m "feat(members): admin invite mutation, getInviteByToken, first-admin bootstrap"
```

---

### Task 6: Invite email via Convex action (Gmail API — reused from padel)

> **Mechanism correction:** padel does NOT use SMTP/nodemailer — it sends via the **Gmail API**
> (`googleapis`, OAuth2 refresh-token). This task ports padel's `utils/gmailSender.js` send logic
> into a Convex `"use node"` action and reuses padel's existing OAuth app credentials.

**Files:**
- Create: `/home/claude/dev/tennis/convex/email.ts`
- Modify: `/home/claude/dev/tennis/convex/members.ts` (schedule the email from `createMember`)
- Modify: `/home/claude/dev/tennis/convex/_generated/api.d.ts` (register `email`)

**Interfaces:**
- Consumes: Gmail OAuth env vars on the Convex instance; `{ token, email }` from `createMember`.
- Produces: `internal.email.sendInvite({ email, token })` — `"use node"` action that emails the accept-invite link. `createMember` schedules it after inserting the invite.

- [ ] **Step 1: Set the Gmail OAuth env vars on the tennis instance** (reuse padel's working OAuth app)

These values live in padel's real `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`; sender account `padel.asdragon@gmail.com`). **Do not echo the secret values** — read them from `/home/claude/dev/padel/.env` and set them directly. Run:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis
set -a; . /home/claude/dev/padel/.env; set +a   # loads GOOGLE_* into the shell without printing
npx convex env set GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
npx convex env set GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
npx convex env set GOOGLE_REFRESH_TOKEN "$GOOGLE_REFRESH_TOKEN"
npx convex env set GMAIL_FROM "Dragon Tennis <padel.asdragon@gmail.com>"
npx convex env set APP_URL http://localhost:3001   # local-only phase; switch to public URL at deploy
npx convex env list | grep -E 'GOOGLE_|GMAIL_FROM|APP_URL'
```
Expected: `npx convex env list` shows `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_FROM`, `APP_URL` (values masked).

- [ ] **Step 2: Write the email action** (ports padel's `utils/gmailSender.js` Gmail API logic)

`convex/email.ts`:
```ts
"use node";

import { v } from "convex/values";
import { google } from "googleapis";
import { internalAction } from "./_generated/server";

function buildRawMessage(from: string, to: string, subject: string, html: string) {
  const lines = [
    'Content-Type: text/html; charset="UTF-8"',
    "MIME-Version: 1.0",
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    html,
  ];
  return Buffer.from(lines.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const sendInvite = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }) => {
    const appUrl = process.env.APP_URL ?? "http://localhost:3001";
    const link = `${appUrl}/accept-invite/${token}`;
    const from = process.env.GMAIL_FROM ?? "Dragon Tennis <padel.asdragon@gmail.com>";

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      // Fallback: no OAuth configured — log the link so the flow stays testable.
      console.log(`[invite] (no Gmail creds) lien pour ${email}: ${link}`);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:3000",
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const html = `<p>Bonjour,</p>
<p>Vous avez été invité à rejoindre l'application Dragon Tennis.</p>
<p><a href="${link}">Cliquez ici pour définir votre mot de passe</a> (lien valable 7 jours).</p>`;

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: buildRawMessage(from, email, "Votre invitation — Dragon Tennis", html) },
    });
    console.log(`[invite] email envoyé à ${email} (id ${result.data.id})`);
  },
});
```

Register `email` in `convex/_generated/api.d.ts` (3-step manual process).

- [ ] **Step 3: Schedule the email from `createMember`**

In `convex/members.ts`, add the import at the top:
```ts
import { internal } from "./_generated/api";
```
Replace the `createMember` handler body so it schedules the email after inserting the invite:
```ts
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const token = await insertInvite(ctx, { ...args, role: "user" });
    await ctx.scheduler.runAfter(0, internal.email.sendInvite, {
      email: args.email.toLowerCase(),
      token,
    });
    return { token };
  },
```

- [ ] **Step 4: Deploy and verify the email action runs**

Run:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis && npx convex deploy
# Trigger the action directly to confirm Gmail send works (sends a real email to the admin):
npx convex run email:sendInvite '{"email":"neotokyo.794@gmail.com","token":"test-token"}'
npx convex logs --limit 20
```
Expected: deploy succeeds; the logs show `[invite] email envoyé à neotokyo.794@gmail.com (id ...)` and the test email arrives. (If creds are absent, logs show `[invite] (no Gmail creds) lien pour ...` with the URL.)

- [ ] **Step 5: Commit**

```bash
cd /home/claude/dev/tennis
git add convex/email.ts convex/members.ts convex/_generated
git commit -m "feat(email): Gmail API invite action (ported from padel) wired into createMember"
```

---

### Task 7: Accept-invite flow (member sets password and signs in)

**Files:**
- Create: `/home/claude/dev/tennis/app/accept-invite/[token]/page.tsx`
- Create: `/home/claude/dev/tennis/components/AcceptInviteForm.tsx`

**Interfaces:**
- Consumes: `api.members.getInviteByToken` (Task 5), `signIn` Password `signUp` flow, the invite-gated `createOrUpdateUser` callback (Task 3).
- Produces: a working end-to-end account-creation path.

- [ ] **Step 1: Write the accept-invite form**

`components/AcceptInviteForm.tsx`:
```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInviteForm({ token }: { token: string }) {
  const invite = useQuery(api.members.getInviteByToken, { token });
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (invite === undefined) return <p>Chargement…</p>;
  if (invite === null) return <p className="text-red-600">Invitation invalide ou expirée.</p>;

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const formData = new FormData(event.currentTarget);
        formData.set("email", invite.email);
        formData.set("flow", "signUp");
        try {
          await signIn("password", formData);
          router.push("/");
        } catch {
          setError("Impossible de créer le compte. L'invitation est peut-être expirée.");
          setSubmitting(false);
        }
      }}
    >
      <p className="text-sm text-gray-600">
        Bienvenue {invite.firstName} {invite.lastName} — définissez votre mot de passe pour {invite.email}.
      </p>
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="Mot de passe (8 caractères min.)"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Création…" : "Activer mon compte"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

`app/accept-invite/[token]/page.tsx`:
```tsx
import { AcceptInviteForm } from "@/components/AcceptInviteForm";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Dragon Tennis</h1>
      <AcceptInviteForm token={token} />
    </main>
  );
}
```

- [ ] **Step 3: Build, deploy, and run the full end-to-end check**

Run:
```bash
cd /home/claude/dev/tennis && npm run build && npm run lint
npm run dev    # serves on http://localhost:3001
```
Then in a browser:
1. Visit `http://localhost:3001/accept-invite/<admin token from Task 5 Step 3>`.
2. Set a password → expect redirect to `/`.
3. Verify the admin user now exists and is well-formed:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
cd /home/claude/dev/tennis
npx convex run users:listMembers '{}'   # NOTE: requires auth — see below
```
`listMembers` requires an authenticated admin, so verify instead via the data browser or a temporary internal query. Quick check that the negative path holds: visit `/accept-invite/not-a-real-token` → expect "Invitation invalide ou expirée." Visiting the **same** admin token again after use → expect the same invalid message (invite is now `used`).

Expected: account creation succeeds for a valid unused token; reused/invalid tokens are rejected; the new user has `role:"admin"`, `balance:0`, `status:"active"`.

- [ ] **Step 4: Commit**

```bash
cd /home/claude/dev/tennis
git add app/accept-invite components/AcceptInviteForm.tsx
git commit -m "feat(auth): accept-invite flow — member sets password and signs in"
```

---

### Task 8: Route protection, protected home, and production deploy (PM2 + Nginx)

**Files:**
- Modify: `/home/claude/dev/tennis/app/page.tsx` (protect + show identity + sign-out)
- Create: `/home/claude/dev/tennis/components/AuthGate.tsx`
- Create: `/home/claude/dev/tennis/ecosystem.config.cjs`
- Create: `/home/claude/dev/tennis/deploy/nginx-tennis.conf`

**Interfaces:**
- Consumes: `api.users.getMe`, `<SignOutButton>`, `useConvexAuth`.
- Produces: a deployed app at `https://tennis.aidigitalassistant.cloud` gated behind sign-in.

- [ ] **Step 1: Write a reusable client-side auth gate**

`components/AuthGate.tsx`:
```tsx
"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center">Chargement…</div>;
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Make the home page protected and identity-aware**

Replace `app/page.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthGate } from "@/components/AuthGate";
import { SignOutButton } from "@/components/SignOutButton";

export default function Home() {
  return (
    <AuthGate>
      <HomeContent />
    </AuthGate>
  );
}

function HomeContent() {
  const me = useQuery(api.users.getMe);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold">Dragon Tennis</h1>
        <SignOutButton />
      </header>
      {me ? (
        <p>
          Connecté : {me.firstName} {me.lastName} ({me.role}) — solde {me.balance ?? 0} XPF
        </p>
      ) : (
        <p>Chargement du profil…</p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build and verify protection locally**

Run:
```bash
cd /home/claude/dev/tennis && npm run build && npm run lint && npm run dev
```
In a browser: visit `http://localhost:3001/` while signed out → expect redirect to `/signin`. Sign in with the admin account from Task 7 → expect the home page showing `Connecté : Christian Gall (admin) — solde 0 XPF`.

- [ ] **Step 4: Write the PM2 config**

`ecosystem.config.cjs`:
```js
module.exports = {
  apps: [
    {
      name: "tennis",
      cwd: "/var/www/tennis",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
    },
  ],
};
```

- [ ] **Step 5: Write the Nginx vhost (two server blocks: app + convex)**

`deploy/nginx-tennis.conf`:
```nginx
# App front-end
server {
    server_name tennis.aidigitalassistant.cloud;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 80;
}

# Convex backend (sync engine 3220 + http actions 3221)
server {
    server_name convex-tennis.aidigitalassistant.cloud;
    location /.well-known/ { proxy_pass http://127.0.0.1:3221; }
    location /http/        { proxy_pass http://127.0.0.1:3221; }
    location / {
        proxy_pass http://127.0.0.1:3220;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    listen 80;
}
```
> Note: confirm the exact `/.well-known/` and HTTP-action routing against the existing LifeLup Convex vhost (`/etc/nginx/sites-available/`) and mirror its split — LifeLup already proxies 3210/3211 correctly; copy that block's structure, swapping ports to 3220/3221 and the server_name.

- [ ] **Step 6: Deploy to production and run TLS issuance**

Run:
```bash
# App code into the production tree:
sudo mkdir -p /var/www/tennis
sudo git -C /var/www/tennis clone /home/claude/dev/tennis . 2>/dev/null || (cd /var/www/tennis && sudo git pull)
# CRITICAL (final-review Important #1): NEXT_PUBLIC_CONVEX_URL is inlined at BUILD time.
# .env.local is gitignored and absent in the clone — provision it BEFORE `npm run build`,
# or the bundle gets `new ConvexReactClient(undefined)` and crashes at load.
echo "NEXT_PUBLIC_CONVEX_URL=https://convex-tennis.aidigitalassistant.cloud" | sudo tee /var/www/tennis/.env.production >/dev/null
cd /var/www/tennis && sudo npm ci && npm run build
# Also switch the email action's APP_URL to the public origin (was localhost:3001 for local phase):
#   npx convex env set APP_URL https://tennis.aidigitalassistant.cloud
# Convex backend (already deployed to the container in earlier tasks; redeploy from prod tree):
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
npx convex deploy
# Nginx:
sudo cp /home/claude/dev/tennis/deploy/nginx-tennis.conf /etc/nginx/sites-available/tennis
sudo ln -sf /etc/nginx/sites-available/tennis /etc/nginx/sites-enabled/tennis
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tennis.aidigitalassistant.cloud -d convex-tennis.aidigitalassistant.cloud
# PM2:
pm2 start /var/www/tennis/ecosystem.config.cjs && pm2 save
```
Expected: `nginx -t` OK; certbot issues certs for both hostnames; `pm2 list` shows `tennis` online.

- [ ] **Step 7: Manual production smoke test**

In a browser:
1. `https://tennis.aidigitalassistant.cloud/` signed out → redirects to `/signin`.
2. Sign in as admin → home shows identity + balance 0.
3. `https://convex-tennis.aidigitalassistant.cloud/.well-known/openid-configuration` → `"issuer"` is `https://convex-tennis.aidigitalassistant.cloud`.

- [ ] **Step 8: Commit**

```bash
cd /home/claude/dev/tennis
git add app/page.tsx components/AuthGate.tsx ecosystem.config.cjs deploy/nginx-tennis.conf
git commit -m "feat: route protection, protected home, PM2 + Nginx production deploy"
```

---

## Self-Review

**1. Spec coverage (Phase 1 slice of the spec):**
- §4 Topologie dédiée → Task 2 (Docker), Task 8 (Nginx/PM2). ✓
- §5 Schéma Convex → Task 3 (full schema, incl. reserved Phase 2/3 tables). ✓
- §6 modules auth.ts/auth.config.ts/users.ts/members.ts/email.ts → Tasks 3, 4, 5, 6. ✓
- §9 Auth & membres (Convex Auth, signup disabled, admin crée membre, invite email, accept-invite, reset) → Tasks 3–7. Password **reset** flow (forgot-password) is referenced by the sign-in link but its page is **deferred to Phase 2** (noted below) — Convex Auth `reset` flow needs the same SMTP wiring landed in Task 6, so it's a small Phase 2 add. ✓ (gap acknowledged)
- §4 gotcha `||` not `??` → Task 3 Step 2. ✓
- Secrets regenerated → Task 2 (instance secret, JWT keys). ✓

**2. Placeholder scan:** No "TBD"/"implement later". The only intentional fill-ins are real secret values (`<paste …>`, `<padel smtp host>`) which are operator inputs, not code placeholders, and are clearly marked. ✓

**3. Type consistency:** `createMember`/`seedAdminInvite` both funnel through `insertInvite` (same shape). `getInviteByToken` returns `{email,firstName,lastName}` — consumed exactly by `AcceptInviteForm`. `getMe` returns the user doc — `HomeContent` reads `firstName/lastName/role/balance`, all defined in the `users` table. `requireAdmin` defined in `users.ts`, imported by `members.ts`. ✓

**Known deferrals to Phase 2 (intentional, not gaps):** forgot-password / reset-verification page; `forgot-password` link currently points to a route added in Phase 2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-16-tennis-phase1-infra-auth.md`. Phases 2 (solde + activation Legrand) and 3 (admin + FAQ + dashboards) get their own plans after Phase 1 lands.
