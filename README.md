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

## Architecture overview

### Auth vs E2EE separation

- **Auth**: username + password stored in Convex (hashed with `scrypt`). This is only for authentication and sessions.
- **E2EE**: derived keys and note encryption are entirely client-side. Convex never receives plaintext.

### Key hierarchy

1. **Master Key (MK)**: derived from the login password using Argon2id and a per-user salt stored server-side.
2. **Data Encryption Key (DEK)**: random symmetric key created client-side; used for all note encryption.
3. **Per-device wrapping key**: each device has its own AES-GCM key used to wrap the DEK.
   - The device key is encrypted with the MK and stored only in IndexedDB on that device.
   - The wrapped DEK is stored in Convex **per device**.

### Encryption flow (signup)

1. Client registers user (auth).
2. Convex returns the per-user `e2eeSalt`.
3. Client derives MK with Argon2id and generates a random DEK.
4. Client generates a device wrapping key, encrypts it with the MK, and stores it locally.
5. Client wraps the DEK with the device key and stores the wrapped DEK in Convex.

### Encryption flow (login)

1. Client logs in (auth) and receives `e2eeSalt` + session token.
2. Client derives MK and decrypts the device key from local storage.
3. Client fetches the wrapped DEK from Convex, unwraps locally, and decrypts notes.

### Offline storage & sync

- Notes are **encrypted before storage**.
- Encrypted notes are cached in IndexedDB for offline access.
- New notes are queued in a `pendingNotes` store while offline.
- When back online, notes are uploaded with deterministic, append-only behavior (no edits).

## Security notes & limitations

- Browser storage is **best-effort** and not equivalent to a hardware enclave.
- This demo uses AES-GCM for both note encryption and wrapping. Nonces are random per encryption.
- Password-based MK derivation uses Argon2id via `argon2-browser` with configurable parameters.

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
- If you want separate login and encryption passwords, adjust `deriveMasterKey` to use a second password prompt.

---

This template prioritizes clarity over cleverness so you can expand it safely.
