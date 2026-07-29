# Vault — implementation plan

## Context

Vault is a new, fourth app in the household set (Orbit, Tally, Tandem). It is a
**password record-keeper**: categorised entries with account name, username/email,
password, URL, an icon and free-form notes. Explicitly **not** an autofill
extension — nothing injects into other apps or pages.

It ships the same way Orbit does: a React + Vite + TypeScript PWA installed to
the iOS home screen, hosted on Vercel, backed by the **shared** Supabase project.
Because it holds every password the user owns, the security posture is the
product, not a feature of it — so the design below is **zero-knowledge**: the
master password never leaves the device, and Supabase only ever stores ciphertext.

**This plan produces a document, not code.** The Vault repo does not exist yet.
Step 0 is to commit this plan to `hcrisapulli87/orbit` on branch
`claude/vault-password-manager-plan-g2exau` as `docs/vault-plan.md`, so it is
version-controlled somewhere until the new repo is created.

### Decisions already made

| Question | Decision |
|---|---|
| Account creation (project sign-ups are disabled) | Edge Function + invite secret, sign-ups stay disabled |
| Lost master password | Recovery kit — a one-time code shown at setup |
| In v1 | Biometric unlock (Face ID/Touch ID), copy-to-clipboard with auto-clear |
| Deferred | TOTP MFA, Have I Been Pwned breach checking |
| Account icons | Monogram by default, optional user upload (encrypted); no favicon fetching |

---

## Threat model — what this does and does not protect against

Stating this up front because it drives every choice below.

**Protected against:** anyone with database access (including the Supabase
dashboard, a leaked service-role key, a compromised backup, or the other person
who shares this Supabase project) reading passwords. They see ciphertext and
nothing else. Also: a stolen unlocked phone (auto-lock), shoulder-surfing
(dotted by default), and the iOS app-switcher screenshot (blur on hide).

**Not protected against:** a compromise of the app code itself — XSS, or a
malicious dependency. Client-side encryption cannot survive an attacker running
in the same page as the decryption key. The mitigations are structural, not
cryptographic, and they are load-bearing: a strict CSP, a near-zero dependency
count, a committed lockfile, no analytics, no third-party scripts, no CDN.

**Deliberately impossible:** server-side password reset. There is no key escrow.
The recovery kit is the only path back in.

---

## Key hierarchy

The one design decision everything else follows from.

```
master password + email (as KDF salt)
  │
  └─ Argon2id ──────────────────────────────► masterKey (32 bytes, never stored)
       │
       ├─ HKDF-SHA256(info="vault:auth:v1") ─► authKey
       │     └─ base64 ──► sent to Supabase as the account password
       │                   (Supabase bcrypts it; the server never sees the
       │                    master password, only a hash of a hash)
       │
       └─ HKDF-SHA256(info="vault:wrap:v1") ─► wrapKey (AES-GCM 256)
             └─ decrypts ──────────────────► vaultKey (random 32 bytes)
                   └─ AES-GCM-256 encrypts every sensitive field
```

**Why the extra `vaultKey` indirection:** changing the master password re-wraps
32 bytes instead of re-encrypting the entire vault. It also lets three
independent unlock paths exist side by side.

`vaultKey` is stored **only** as three wrapped copies:

| Wrap | Wrapped with | Stored where |
|---|---|---|
| `wrapped_master` | `wrapKey` from the master password | `vault_identity` (Supabase) |
| `wrapped_recovery` | HKDF of the recovery code | `vault_identity` (Supabase) |
| `wrapped_biometric` | HKDF of the WebAuthn PRF output | **IndexedDB, per device** — never synced |

**KDF parameters live in the `vault_identity` row** (`kdf_mem`, `kdf_iters`,
`kdf_parallelism`, `kdf_version`), so they can be raised years from now without
breaking existing ciphertext. Baseline is the OWASP Argon2id recommendation:
m=19456 KiB, t=2, p=1 — roughly 100–200 ms on an iPhone, and biometrics mean
it rarely runs anyway.

**Handling of the key in memory** — the rules that make the above real:

- `vaultKey` is imported as a **non-extractable `CryptoKey`**. After import, the
  raw bytes cannot be read back out from JavaScript at all.
- It lives in a module-level closure in `src/lib/session.ts`. Never in React
  state, never in a context value, never in `localStorage`, never serialised.
- Raw bytes exist only during setup, re-wrap and master-password change; the
  backing `Uint8Array` is zero-filled immediately after.

---

## Cryptographic primitives

`Argon2id` has no WebCrypto implementation. Use **`hash-wasm`** (small, WASM,
actively maintained) for Argon2id only; everything else is native `SubtleCrypto`
— HKDF, AES-GCM, `crypto.getRandomValues`.

The alternative is PBKDF2-SHA256 at 600k iterations, which is native and adds
zero dependencies, but is materially weaker against GPU cracking. Given that
resisting an offline attack on a stolen ciphertext database *is* the product,
Argon2id earns its one dependency. **Note this requires `'wasm-unsafe-eval'` in
the CSP `script-src`.**

Field encryption: AES-GCM-256, a fresh random 96-bit IV per field per write,
serialised as `base64(iv ‖ ciphertext ‖ tag)`. GCM's auth tag gives tamper
detection for free — a modified row fails to decrypt rather than decrypting to
garbage.

---

## Database — `supabase/schema.sql`

Follows Orbit's conventions exactly: one idempotent file, run by pasting into
the SQL editor, versioned `-- ── vN:` sections, `create table if not exists`,
policies drop-and-recreate, no `DROP TABLE`/`DELETE`/`TRUNCATE` anywhere.

**Prefix: `vault_`** — alongside Orbit's `task_`, Tally's `budget_`/`tax_`, and
Tandem's `profiles`.

**Owner FK points at `auth.users(id)`, not `public.profiles(id)`.** This is a
deliberate departure from Orbit. Vault's account is a *separate identity* from
the everyday account, and `public.profiles` is the shared table the other apps
read and enumerate — putting the Vault identity there would advertise its
existence to every sibling app. Referencing `auth.users` directly keeps it out.

```
vault_identity          one row, the crypto anchor
  owner_id uuid pk references auth.users(id) on delete cascade
  kdf_version, kdf_mem, kdf_iters, kdf_parallelism   int
  kdf_salt                 text     -- random, not the email (email may change)
  wrapped_master           text     -- base64(iv‖ct)
  wrapped_recovery         text
  recovery_created_at      timestamptz
  lock_timeout_seconds     int  default 120
  created_at, updated_at

vault_categories
  id, owner_id, name_enc text, icon text, colour text, sort_order, created_at

vault_items
  id uuid pk
  owner_id uuid references auth.users(id) on delete cascade
  category_id uuid references vault_categories(id) on delete set null
  name_enc, username_enc, password_enc, url_enc, notes_enc   text
  icon_kind text check (icon_kind in ('monogram','image')) default 'monogram'
  icon_path text                  -- Storage object path; blob itself encrypted
  password_updated_at timestamptz -- plaintext, powers "this password is 3 years old"
  is_favourite boolean
  created_at, updated_at
```

**What stays plaintext, and why it is acceptable:** ids, `owner_id`,
`category_id`, timestamps, `is_favourite`, and a category's `icon`/`colour`.
Everything a person would recognise — item name, username, URL, notes, category
name — is encrypted. The server learns *how many* entries exist and *when* they
changed, and nothing about what they are.

**RLS:** owner-only on all three tables, generated by the same `foreach t in
array [...]` loop Orbit uses at `supabase/schema.sql:366-379`. No read-all
policy, ever. Copy that loop verbatim.

**Realtime: do not enable.** Orbit adds its tables to the `supabase_realtime`
publication; Vault deliberately does not. A single-user vault on one device has
nothing to sync live, and every publication is extra surface.

**Storage:** a private bucket `vault-icons`. Uploaded images are encrypted
client-side *before* upload, so the bucket holds ciphertext blobs. Policy on
`storage.objects` scoped to `(storage.foldername(name))[1] = auth.uid()::text`.

---

## Sign-up — `supabase/functions/vault-signup/`

Project sign-ups stay disabled, so a Deno Edge Function holds the service-role
key and creates exactly one user.

- Accepts `{ email, authHash, inviteSecret }`.
- Compares `inviteSecret` against a function secret using a **constant-time**
  comparison.
- **Refuses if any `vault_identity` row already exists.** Vault is single-user,
  so after first run the endpoint is permanently inert. This is the strongest
  property of the design: the attack window is one use, by the person holding
  the secret.
- Calls `admin.createUser({ email, password: authHash, email_confirm: true })`.
- Never receives, logs, or can derive the master password.

Modelled on `supabase/functions/notify/index.ts` (Deno, header-secret gate).

---

## App structure

New standalone repo. Scaffold mirrors Orbit's conventions: no barrel files,
named exports for components/hooks, default exports for screens, tests
co-located in `domain/` only, one hand-written `styles/theme.css`, no UI library.

```
src/
  domain/            pure, no React, no network — where the tests live
    crypto.ts        KDF, HKDF, wrap/unwrap, encryptField/decryptField
    generator.ts     password generation
    strength.ts      strength scoring
    lock.ts          shouldLock(lastHiddenAt, now, timeoutSeconds) — `now` injected
    monogram.ts      name → initials + deterministic colour
  data/              Supabase I/O, one file per table
    types.ts  identity.ts  items.ts  categories.ts  icons.ts  VaultProvider.tsx
  auth/
    AuthProvider.tsx      session (port Orbit's near-verbatim)
    VaultKeyProvider.tsx  lock/unlock state, idle + hide timers
  lib/
    supabase.ts  session.ts  biometric.ts  clipboard.ts  obscure.ts
  screens/
    FirstRun · Login · Lock · List · Item · ItemEdit · Categories ·
    Generator · Settings · RecoveryKit
  components/  styles/theme.css  main.tsx  App.tsx
supabase/
  schema.sql  functions/vault-signup/
```

### The three-layer gate — `src/App.tsx`

The architectural core. Same flat-branch style as Orbit's `src/App.tsx:22-26`,
with one extra state that does not exist in Orbit:

```tsx
if (loading)      return <Spinner />
if (!identity)    return <FirstRun />     // no vault_identity anywhere yet
if (!session)     return <Login />        // signed out — full email + password
if (!vaultKey)    return <Lock />         // signed in but locked — biometric or master password
return <VaultProvider>{routes}</VaultProvider>
```

**Locked ≠ signed out**, and the distinction is the whole UX:

- **Locked** — `vaultKey` wiped from memory, Supabase session intact. The
  common case, dozens of times a day. Face ID clears it in under a second.
- **Signed out** — Supabase session destroyed. Requires email + master password
  and a full Argon2id derivation.

`<Login />` and `<Lock />` render bare, not as routes, so the URL survives and
deep links land correctly after unlock — the same reason Orbit does it.

---

## Auto-lock

`setTimeout` is not usable for this: iOS suspends timers the moment the app
leaves the foreground. The mechanism is **timestamp comparison**, not a countdown.

- On `visibilitychange` → hidden: write `Date.now()` to `sessionStorage`, and
  **immediately** set `data-obscured` on `<html>` so the blur lands before iOS
  captures the app-switcher thumbnail.
- On `visibilitychange` → visible: `shouldLock(lastHiddenAt, Date.now(), timeout)`
  — a pure function in `domain/lock.ts` with `now` injected, tested at the
  boundaries, per Orbit's testing discipline.
- On `pagehide`: wipe the key unconditionally. Killing the PWA always relocks.
- A separate in-page idle timer (no pointer/key events) covers the app sitting
  open and untouched in the foreground.

Timeout is user-configurable — Immediately / 30s / 1m / 2m / 5m / 15m, default
2 minutes — stored in `vault_identity.lock_timeout_seconds`.

**"Remember me" stores the email only**, in `localStorage` under `vault.email`.
The master password is never written anywhere, under any setting.

---

## Biometric unlock — `src/lib/biometric.ts`

Confirmed viable: Safari 18 / iOS 18+ supports the **WebAuthn PRF extension**
for passkeys held in iCloud Keychain, which is exactly the Face ID / Touch ID
path. External security keys are not supported on iOS and are out of scope.

**Enrolment** (Settings → Enable Face ID, requires the vault already unlocked):
1. `navigator.credentials.create()` with a platform authenticator,
   `residentKey: 'required'`, and `extensions: { prf: {} }`.
2. Confirm `getClientExtensionResults().prf.enabled === true`. **If false, stop
   and say so plainly** — do not silently fall back to a weaker scheme.
3. `navigator.credentials.get()` with `prf: { eval: { first: <fixed salt> } }`
   to obtain the PRF output.
4. `HKDF(prfOutput)` → wrap `vaultKey` → store `wrapped_biometric` + the
   credential id in **IndexedDB**, never in Supabase.

**Unlock:** `credentials.get()` with the same salt → same PRF output → unwrap.
No Argon2id, no password, no network round-trip.

Two things to surface in the UI rather than bury:
- Enrolment is **per device**. A new device re-enrols.
- Deleting the PWA from the home screen destroys the IndexedDB wrap. The master
  password and the recovery kit are unaffected — this is precisely what they are
  for. (Installed PWAs are exempt from Safari's 7-day storage eviction; a Vault
  used from a browser tab rather than the home screen is not, so the app should
  nudge toward installing.)

---

## Recovery kit

At first run, after the vault key is generated:

1. Generate 128 bits from `crypto.getRandomValues`, encoded as a grouped,
   unambiguous string (Crockford base32 — no I/L/O/U): `VAULT-XXXXX-XXXXX-…`.
2. `HKDF` it → wrap `vaultKey` → store as `wrapped_recovery`.
3. Show it **once**, on a screen that requires typing it back to continue, with
   copy and print actions. Never shown again and never recoverable — Vault
   stores only the wrapped key, not the code.

`/settings` offers **Regenerate recovery kit** (invalidates the old code) and
**Change master password** (re-derives `wrapKey`, re-wraps `vaultKey`, updates
the Supabase account password to the new `authKey` — no vault re-encryption).

---

## Features

**List (`/`)** — search and category filter run **in memory over decrypted
items**, since ciphertext cannot be queried server-side. Correct at this scale;
a personal vault is hundreds of rows, not millions. Each row shows the monogram
or uploaded icon, name, and username. Passwords never appear in the list.

**Item detail (`/item/:id`)** — password rendered as `••••••••` with a
**Reveal** toggle. No re-authentication on reveal, per the requirement: the user
is already unlocked, so a second check is friction with no security gain.
Auto-re-hides after 30 seconds. Copy button wipes the clipboard after 30 s (and
on lock), with a caveat worth stating in the UI: **iOS gives no guarantee the
clipboard clears if the app is killed first.**

**Add / edit (`/item/new`, `/item/:id/edit`)** — name, username/email, password,
URL, category, notes, icon. Live strength meter. Generate-and-fill button.
Encryption happens in the form's submit handler; plaintext never reaches
`data/items.ts`, which is a pure ciphertext-in/ciphertext-out layer.

**Password generator (`domain/generator.ts`)** — pure and fully tested.
`crypto.getRandomValues` with **rejection sampling**, not modulo, to avoid
biasing the character distribution. Options: length 8–64 (default 20), character
classes, exclude ambiguous characters. Class guarantees are enforced by
**regenerating** until satisfied, never by substituting characters into a
position, which would skew the distribution. Also available standalone at
`/generator`. Tests cover distribution sanity, bias, class guarantees, and
length bounds.

**Strength meter (`domain/strength.ts`)** — `@zxcvbn-ts/core` plus the common
and English language packs, **lazy `import()`-ed** only on the edit screen so it
stays out of the main bundle (~400 KB otherwise). Hand-rolling this is a bad
trade: naive character-class scoring rates `P@ssw0rd1` as strong. Shows the
score, the crack-time estimate, and zxcvbn's specific feedback.

**Categories (`/categories`)** — user-defined, with an emoji and colour. Names
are encrypted; the emoji and colour are not, so the list renders before decrypt.

**Icons** — `domain/monogram.ts` derives initials and a deterministic colour
from the item name (hash → hue), so every entry has a sensible icon with zero
configuration. Optional upload is encrypted client-side, stored in the private
bucket, decrypted to a `blob:` URL for display, and revoked on unmount. **No
favicon fetching in any form** — a request to `westpac.com.au/favicon.ico` tells
Westpac (and any observer) that the user banks there, which is exactly the
metadata a password manager exists to protect.

---

## Deployment

**`vercel.json`** — Orbit's SPA rewrite, plus the security headers that carry
real weight here. A strict CSP is the single highest-value mitigation against
the XSS threat that client-side crypto cannot address:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';        ← wasm-unsafe-eval is for Argon2id
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://<project>.supabase.co;
  img-src 'self' blob: data:;
  frame-ancestors 'none'; base-uri 'none'; object-src 'none';
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
```

**PWA** — `vite-plugin-pwa` with the simpler **`generateSW`** strategy. Orbit
needs `injectManifest` only to host a push listener in the service worker; Vault
has no push, so it does not need the complexity. Two deliberate omissions from
Orbit's manifest: **no share target** (a password manager must not accept
arbitrary shared content) and **no push**. iOS meta tags, safe-area handling
(`--safe-top`/`--safe-bottom`) and the icon pipeline port directly from
`index.html`, `styles/theme.css` and `scripts/generate-icons.mjs`.

**Env** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (same shared
project as Orbit). The invite secret and service-role key live only in Supabase
Edge Function secrets, never in a `VITE_` variable — those are compiled into the
browser bundle and are public by definition.

---

## Phases

| # | Phase | Delivers |
|---|---|---|
| 0 | Commit this plan to `docs/vault-plan.md` on the Orbit branch | version-controlled plan |
| 1 | Repo scaffold, theme, PWA, Vercel + CSP | empty app installs to home screen |
| 2 | `domain/crypto.ts` + tests | key hierarchy proven before any UI exists |
| 3 | `schema.sql`, `vault-signup` function, first-run, login | account created, identity row written |
| 4 | Three-layer gate, lock screen, auto-lock, obscure-on-hide | locking works end to end |
| 5 | CRUD: list, detail, edit, categories, reveal, clipboard | the actual product |
| 6 | Generator + strength meter | both pure-domain, both tested |
| 7 | Recovery kit, change master password | the safety net |
| 8 | Biometric unlock (WebAuthn PRF) | daily-use ergonomics |
| 9 | Icons: monogram + encrypted upload | polish |

Phase 2 lands before any screen deliberately: if the key hierarchy is wrong, it
is far cheaper to find out against a test file than against a vault full of real
passwords.

**Later, explicitly not v1:** TOTP MFA via `supabase.auth.mfa.*`; Have I Been
Pwned k-anonymity breach checking; password history; encrypted export/import;
secure notes and card records; a health dashboard (reused, weak, and stale
passwords).

---

## Verification

**Crypto (`npm test`)** — the tests that matter most, all pure with `now`
injected, per Orbit's discipline:
- Round-trip: `decrypt(encrypt(x, k), k) === x` across unicode, empty and long strings.
- Wrong key fails **closed** — throws, never returns garbage.
- Tampering with any byte of `iv‖ct‖tag` fails to decrypt (GCM auth tag).
- KDF determinism: same password + salt + params → same key; any change → different key.
- All three unwrap paths (master, recovery, biometric) yield the identical `vaultKey`.
- IVs are unique across 10,000 encryptions.
- Generator: no modulo bias over a large sample, class guarantees hold, bounds respected.
- `shouldLock` at the boundaries: just under, exactly at, and just over the timeout.

**Manual, on a real iPhone** — the desktop browser cannot verify these:
1. First run: create account, confirm the recovery kit gates on typing it back.
2. Confirm in the Supabase dashboard that `vault_items` rows are **unreadable
   ciphertext**. This is the headline claim; look at it directly.
3. Add an entry, lock, unlock, confirm it decrypts.
4. Background the app past the timeout → returns locked. Check the **app
   switcher shows a blurred card**, not passwords.
5. Kill the PWA and reopen → locked, session intact, biometric unlock offered.
6. Enrol Face ID, lock, unlock by face. Confirm no master password prompt.
7. Sign out, sign in with the recovery code, set a new master password, confirm
   every existing entry still decrypts (proving the `vaultKey` indirection works).
8. Offline: airplane mode → app shell loads, and a clear message explains why the
   vault cannot be read.
9. `npm run build` clean, and confirm the CSP headers are present on the deployed
   Vercel response — a CSP that fails to apply looks identical to one that works.
