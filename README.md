# E2EE Notes Template (SvelteKit + Convex + Vercel)

This template is a human-readable starting point for a SvelteKit PWA that stores **end-to-end encrypted notes** in a Convex backend. The server only sees ciphertext and metadata — the data encryption key (DEK) and plaintext never leave the client.

## What you get

- **SvelteKit PWA** with offline support + installable manifest.
- **Convex backend** for auth, encrypted notes, and device wrapping records.
- **End-to-end encryption (E2EE)** with Argon2id, per-user DEK, and per-device wrapping keys.
- **Offline-first notes** using IndexedDB with deterministic sync.

## Local setup

### 1) Install dependencies

```bash
npm install
```

### 2) Run Convex locally

```bash
npx convex dev
```

This will create a `.env.local` file with your `CONVEX_URL`.

### 3) Configure the web app

Create `.env` (or `.env.local`) in the repo root:

```bash
VITE_CONVEX_URL="<your-convex-url>"
```

### 4) Run the SvelteKit app

```bash
npm run dev
```

Visit http://localhost:5173

## Deployment (Vercel)

1. Create a new Vercel project from this repository.
2. Set the **Environment Variable** `VITE_CONVEX_URL` to your production Convex deployment URL.
3. Deploy.

Convex hosting is handled separately:

```bash
npx convex deploy
```

## Deployment (GitHub Pages + Custom Domain)

1. Update the SvelteKit adapter to static (already configured in this template) and commit the changes.
2. Push to `main`. The included GitHub Actions workflow builds the app and deploys the `build/` output to GitHub Pages.
3. In GitHub, go to **Settings → Pages** and select **GitHub Actions** as the source.

### Configure base path (only if not using a custom domain)

If you are hosting at `https://<user>.github.io/<repo>/`, set a **repository variable** named `BASE_PATH` to `/<repo>`.
For custom domains, leave `BASE_PATH` unset so assets resolve from `/`.
(`BASE_PATH` is not sensitive, so a variable is appropriate—not a secret.)

**How to set `BASE_PATH` in GitHub:**
1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Variables**, click **New repository variable**.
3. Set **Name** to `BASE_PATH`.
4. Set **Value** to `/<repo>` (replace `<repo>` with your repository name), then click **Add variable**.

**How to set `BASE_PATH` in GitHub:**
1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Variables**, click **New repository variable**.
3. Set **Name** to `BASE_PATH`.
4. Set **Value** to `/<repo>` (replace `<repo>` with your repository name), then click **Add variable**.

### Configure environment variables

Add **either** a **repository variable** *or* an **environment variable** named `VITE_CONVEX_URL` with your Convex deployment URL so the build can complete.
Only one is needed.
Use a **repository variable** if the value is the same for every deployment and you want the simplest setup.
Use an **environment variable** if you need different values per environment (for example, preview vs. production) or if you use environment protection rules like required reviewers.
(`VITE_CONVEX_URL` is typically public, so a variable is appropriate—not a secret.)

**How to set `VITE_CONVEX_URL` in GitHub (repository variable):**
1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Variables**, click **New repository variable**.
3. Set **Name** to `VITE_CONVEX_URL`.
4. Set **Value** to your Convex deployment URL (for example, `https://<your-team>.convex.cloud`), then click **Add variable**.

**How to set `VITE_CONVEX_URL` in GitHub (environment variable):**
1. Go to **Settings → Environments** and select `github-pages` (or create it).
2. Under **Environment variables**, click **Add variable**.
3. Set **Name** to `VITE_CONVEX_URL`.
4. Set **Value** to your Convex deployment URL, then click **Add variable**.

**How to set `VITE_CONVEX_URL` in GitHub:**
1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Variables**, click **New repository variable**.
3. Set **Name** to `VITE_CONVEX_URL`.
4. Set **Value** to your Convex deployment URL (for example, `https://<your-team>.convex.cloud`), then click **Add variable**.

### Optional: Deploy Convex from GitHub Actions

If you want the GitHub Pages workflow to deploy Convex automatically, set:

- **Repository variable** `CONVEX_DEPLOYMENT` (example: `your-team:prod`)
- **Repository secret** `CONVEX_DEPLOY_KEY` (from the Convex dashboard; required for non-interactive CI auth)

When both are present, the workflow runs `npx convex deploy` before the frontend build.

### Custom domain

1. In **Settings → Pages**, set your custom domain (e.g., `notes.example.com`). GitHub will create a `CNAME` file.
2. Create a DNS record:
   - **CNAME** for subdomains: `notes.example.com` → `<user>.github.io`
   - **A records** for apex domains: use GitHub Pages IPs from GitHub docs

## Architecture overview

### Auth vs E2EE separation

- **Auth**: magic link or TOTP (email required) for sessions. The decryption passphrase is never sent to Convex.
- **E2EE**: derived keys and note encryption are entirely client-side. Convex never receives plaintext or the decryption
  passphrase.

### Key hierarchy

1. **Master Key (MK)**: derived from the local passphrase using Argon2id and a per-user salt stored server-side.
2. **Data Encryption Key (DEK)**: random symmetric key created client-side; used for all note encryption.
3. **Per-device wrapping key**: each device has its own AES-GCM key used to wrap the DEK.
   - The device key is encrypted with the MK and stored only in IndexedDB on that device.
   - The wrapped DEK is stored in Convex **per device**.

### Encryption flow (signup)

1. Client registers user (auth) with email and optional TOTP enrollment.
2. Convex returns the per-user `e2eeSalt` and (if enabled) a TOTP secret.
3. Client derives MK from the local passphrase with Argon2id and generates a random DEK.
4. Client generates a device wrapping key, encrypts it with the MK, and stores it locally.
5. Client wraps the DEK with the device key and stores the wrapped DEK in Convex.

### Encryption flow (login)

1. Client logs in with magic link or TOTP and receives `e2eeSalt` + session token.
2. Client derives MK from the local passphrase and decrypts the device key from local storage.
3. Client fetches the wrapped DEK from Convex, unwraps locally, and decrypts notes.

### Offline storage & sync

- Notes are **encrypted before storage**.
- Encrypted notes are cached in IndexedDB for offline access.
- New notes are queued in a `pendingNotes` store while offline.
- When back online, notes are uploaded with deterministic, append-only behavior (no edits).

## Security notes & limitations

- Browser storage is **best-effort** and not equivalent to a hardware enclave.
- This demo uses AES-GCM for both note encryption and wrapping. Nonces are random per encryption.
- Passphrase-based MK derivation uses Argon2id via `argon2-browser` with configurable parameters.

## Project structure

```
convex/               # Convex backend functions + schema
src/lib/crypto/       # Key derivation and encryption helpers
src/lib/storage/      # IndexedDB helpers (offline cache + device keys)
src/routes/           # SvelteKit pages
static/               # PWA icons
```

## Notes for extending

- To add multi-device onboarding, implement a DEK export/import flow (e.g., QR or passphrase) so a new device can register its own wrapping key.
- If you want passphrase recovery, design a key rotation or escrow flow that does not expose plaintext to the server.

---

This template prioritizes clarity over cleverness so you can expand it safely.

## Data migrations (Convex)

When you change the schema in a way that adds new required fields, you need to
backfill existing documents so they conform before re-tightening the validators.
A safe workflow looks like this:

1. **Temporarily relax the schema** for the new field (e.g., `v.optional(...)`).
2. **Run a migration** to backfill existing documents.
3. **Tighten the schema again** once the data is updated.

This repo includes a migration to backfill missing user emails:

```bash
npx convex run migrations:backfillUserEmails --args '{"defaultDomain":"legacy.invalid"}'
```

Choose a `defaultDomain` that you control, or update the migration to map
real emails from your own source of truth before making `email` required again.
