<img src="https://github.com/user-attachments/assets/3496d54a-9f05-4834-b319-4839b43a6352" width="500">
<br><br><br>

**NoAppStore** is a template for an E2EE SvelteKit PWA. With this template you can deploy an E2EE app cross platform to any device!!!

The demo hosts the client on github pages and stores **end-to-end encrypted notes** in a Convex backend. The server only sees ciphertext and metadata — the data encryption key (DEK) and plaintext never leave the client.

## What you get

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

To enable TOTP during registration, set a 32-byte base64 secret for
Convex so TOTP secrets can be encrypted at rest. You only need to set this once
per Convex environment; changing it later will prevent existing TOTP secrets from
decrypting.

```bash
npx convex env set TOTP_ENCRYPTION_KEY "<32-byte-base64>"
```

For production, set the variable on your production Convex deployment (e.g.
via the Convex dashboard or `npx convex env set` while targeting the prod
deployment) and keep it stable across deploys.

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

## Versioning

The app version lives in `src/lib/version.ts` and is bumped automatically by the GitHub workflow. You can do it manually by using the following npm scripts to manage version updates:

```bash
npm run version:major
npm run version:minor
npm run version:patch
```

## Deployment (GitHub Pages + Custom Domain)

1. Push to `main`. The included GitHub Actions workflow builds the app and deploys the `build/` output to GitHub Pages.
3. In GitHub, go to **Settings → Pages** and select **GitHub Actions** as the source.

### Configure base path (only if not using a custom domain)

If you are hosting at `https://<user>.github.io/<repo>/`, set a **repository variable** named `BASE_PATH` to `/<repo>`.
For custom domains, leave `BASE_PATH` unset so assets resolve from `/`.

### Configure environment variables

Add **either** a **repository variable** *or* an **environment variable** named `VITE_CONVEX_URL` with your Convex deployment URL so the build can complete.
Only one is needed.
Use a **repository variable** if the value is the same for every deployment and you want the simplest setup.
Use an **environment variable** if you need different values per environment (for example, preview vs. production) or if you use environment protection rules like required reviewers.
(`VITE_CONVEX_URL` is typically public, so a variable is appropriate—not a secret.)

### Deploy Convex from GitHub Actions

To enable deployment of Convex from the GitHub workflow, set:

- **Repository secret** `CONVEX_DEPLOY_KEY` (from the Convex dashboard; required for non-interactive CI auth)
- **Repository or environment variable** `VITE_CONVEX_URL` with your Convex deployment URL

The workflow runs `npx convex deploy --url "$VITE_CONVEX_URL"` before the frontend build.

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

1. Client registers user (auth) with email or TOTP enrollment. **note for magic links to work you must set up your own email provide to make use of the token from the magicLinks table**
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

- The client is deployed to GitHub pages so that it can be publicly audited
- Updates never happen automatically. If there is an update, a button will appear next to the version number in the top right corner.
- Browser storage is not equivalent to a hardware enclave.
- This demo uses AES-GCM for both note encryption and wrapping. Nonces are random per encryption.
- Passphrase-based MK derivation uses Argon2id via `argon2-browser` with configurable parameters.
- Even with E2EE, Convex still stores metadata like note timestamps, ciphertext sizes, and note identifiers.

## Project structure

```
convex/               # Convex backend functions + schema
src/lib/crypto/       # Key derivation and encryption helpers
src/lib/storage/      # IndexedDB helpers (offline cache + device keys)
src/routes/           # SvelteKit pages
static/               # PWA icons
```
