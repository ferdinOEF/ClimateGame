# Deploying Riptide Rising on the Firebase Spark (free) plan

Everything here fits inside the free tier. No billing account, no card.

---

## 0. What Spark actually gives you

Worth reading before you build anything on top of it, because two of these
limits shaped the architecture.

| Service | Free quota | What it means here |
|---|---|---|
| Hosting | 10 GB stored, 360 MB/day transfer | The built bundle is a few MB. Comfortable. |
| Firestore | 1 GiB stored, **50k reads/day**, **20k writes/day**, 20k deletes/day | The binding constraint. See "Staying inside the quota". |
| Authentication | Unlimited anonymous + Google sign-in | No cost concern. |
| **Cloud Functions** | **Not available on Spark** | The reason all score validation lives in `firestore.rules`. |

The missing Functions tier is the single most important fact about this
deployment. There is no trusted server that can recompute a score, so the
security rules do all the validation they can and the remaining trust gap
is documented honestly under "Hardening beyond Spark".

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Name it (e.g. `root-and-ruin`). Google Analytics is optional; skip it.
3. When asked about a billing plan, stay on **Spark**.

## 2. Register a Web app

1. Project Overview → the **`</>`** (Web) icon.
2. Give it a nickname. **Do not** tick "Firebase Hosting" here — the CLI
   sets that up in step 5 and doing both creates a confusing duplicate.
3. Copy the `firebaseConfig` values it shows you.

## 3. Wire up local config

```bash
cp .env.example .env.local
```

Fill in the six values from step 2:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=root-and-ruin.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=root-and-ruin
VITE_FIREBASE_STORAGE_BUCKET=root-and-ruin.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
```

> **These are not secrets.** A Firebase web config identifies the project
> and ships in the client bundle of every Firebase web app by design. What
> protects your data is `firestore.rules` (step 6) plus the API key
> restrictions in step 9 — not the secrecy of these strings.
>
> The game runs fine with this file absent: campaign, levels, stars, badges
> and personal bests all work offline against `localStorage`. Only the
> shared leaderboard and cross-device sync need it.

### The email requirement (`VITE_REQUIRE_EMAIL`)

By default the game asks for nothing. Play goes straight into a level, and
there is no email sheet, sign-in screen, Google button or "Signed in as" text
anywhere. Players still get an anonymous Firebase session, so progress syncs
to `players/` and personal bests reach the leaderboard; no email address is
collected, stored or sent.

To bring the email sheet and the account features back, build with:

```
VITE_REQUIRE_EMAIL=true
```

Set it in `.env.local` for a local build, or as an environment variable on
whatever builds the deployment (Vercel project settings, a CI job), then
rebuild — it is read at build time. Only the exact value `true` turns it on.
Nothing in `firestore.rules` depends on it, and registrations collected while
it was on stay in `playtesters/` untouched; the client simply does not read
them while it is off. The Authentication steps below only matter when it is
on, apart from **Anonymous**, which the leaderboard always needs.

## 4. Turn on Authentication

Console → **Build → Authentication → Get started**, then under
**Sign-in method** enable:

- **Email/Password** — the login screen. Enable the top toggle only; leave
  "Email link (passwordless sign-in)" off unless you specifically want it.
- **Anonymous** — required. This is how a first-time player gets a uid and
  appears on the leaderboard without being asked to sign up, and it is what
  the account they later create gets *linked to*, so their guest progress
  carries over instead of being orphaned.
- **Google** — optional. A one-tap alternative to typing a password.

If you skip Anonymous, guest play breaks and every visitor hits the login
screen first. If you skip Email/Password, the login form returns
`auth/operation-not-allowed`.

### Where your user data actually lives

Two places, and it is worth knowing which is which:

- **Authentication → Users** — every account: email, uid, created date,
  last sign-in. This is Firebase's own store. Passwords are held here as
  salted hashes and are not visible to you, to this app, or to anyone. That
  is deliberate and not something to work around: an app that can read its
  users' passwords is one breach away from leaking them.
- **Firestore → `players/{uid}`** — the game's own record: display name, a
  mirrored copy of the email, star and score totals, badges, and a
  `progress` subcollection with per-level bests.
- **Firestore → `playtesters/{uid}`** — the email address a player types into
  the sheet before their first level. This is the collection to open when you
  want to see who has played a test session; it is flat and keyed by uid so
  the whole list reads as one page.

The uid is the join key between all three. **Never store a password in
Firestore** — there is no version of that which is safe, and Firebase Auth
already solves the problem properly.

### A note on `playtesters/`

This collection holds personal data. Three things follow, all enforced in
`firestore.rules` rather than left to convention:

It used to hold a name and an age as well. Both were dropped: the name only
ever seeded a display name that Settings already owns, and the age was
personal data about, frequently, a child, collected for nothing the game ever
read. `validPlaytester()` now uses `hasOnly` to forbid both, so a stale client
cannot send them, and the client overwrites rather than merges so that
documents written under the old schema shed the two fields on their next
write. Existing documents that are never written again keep them — clear them
from the console if that matters to you.

- No public read. A document is readable only by the uid that owns it; the
  console is the only other way in, which is the point.
- Nothing from it reaches a leaderboard. The leaderboard rules accept
  `displayName` and nothing else, so there is no path by which an address
  becomes public even if client code tried. Nothing derives a display name
  from the address either, which would have published half of it.
- The email here is **self-declared and unverified** — somebody typed it
  into a form, and nothing sent a confirmation link. The client calls the
  field `declaredEmail` for that reason, and it is deliberately not checked
  against `request.auth.token.email` the way the one on `players/` is. Treat
  it as a contact detail for a playtest, never as proof of identity.

If you run a session with a class of children, the consent conversation
happens with their school. The in-app notice tells a player what is kept and
why, which is necessary and not sufficient.

### Adding a nicer URL

The project ID cannot be changed after the project is created, and it is what
generates the default `<project-id>.web.app` address. To serve the game from a
better URL, add a second Hosting site rather than trying to rename anything.
Multiple sites are supported on Spark, up to 36 per project, at no cost.

```bash
npx firebase hosting:sites:create your-site-id
```

Then give each site its own entry in `firebase.json` by turning `hosting` into
an array and adding a `site` key to each. This project deploys to both
`rootandruin` and the original `rootride-4ddaa`, so a link already shared with
somebody does not rot.

**Then add the new domain to Firebase Auth, or Google sign-in breaks on it.**

Authentication keeps an allowlist of domains permitted to run the popup and
redirect OAuth flows. A newly created Hosting site is not on it, and the
failure is narrow and easy to miss: anonymous and email/password sign-in both
keep working, the registration sheet still writes to Firestore, the whole game
still plays — only the "Continue with Google" button fails, with
`auth/unauthorized-domain`.

Console → **Authentication → Settings → Authorized domains → Add domain**, and
enter the bare host (`rootandruin.web.app`, no scheme, no trailing slash).

There is no Firebase CLI command for this. It is a console action, or a call to
the Identity Toolkit admin API.

### Checking it works without guessing

The game is built to degrade silently when the cloud is unavailable — the
registration mirror catches its own failures, score writes are
fire-and-forget. That is right for a player and unhelpful for you.

So: **Settings → Cloud status → "Test the connection"** performs the real
write and tells you exactly what came back. A pass means a document is in
`playtesters/` right now. The two failures worth telling apart look identical
from outside and read very differently in that message:

- *"Could not get a session"* — Anonymous sign-in is not enabled under
  Authentication. Fix in step 4.
- *"The write was rejected"* — the rules refused it. Re-deploy them (step 6)
  and check the message for which condition failed.

## 5. Create the Firestore database

Console → **Build → Firestore Database → Create database**.

- Start in **production mode** (locked). Step 6 replaces the rules anyway,
  and test mode leaves the database world-writable until it expires.
- Pick a region close to your players (`asia-south1` for India). **This is
  permanent** — it cannot be changed later without recreating the project.

## 6. Deploy rules and indexes

```bash
npm install
npx firebase login
npx firebase use --add          # pick your project, alias it "default"
npm run deploy:rules
```

That pushes `firestore.rules` and `firestore.indexes.json`.

The indexes matter: the leaderboard queries order by `score desc,
updatedAt asc` (score, then whoever got there first breaks the tie). Without
the composite index that query fails **at runtime**, not at build time — so
deploy indexes before testing the board, or the console will hand you a
"create index" link instead of results.

## 7. Build and deploy

```bash
npm run deploy
```

That runs `tsc -b && vite build`, then `firebase deploy`. Your game is at
`https://<project-id>.web.app`.

For hosting-only redeploys (no rules changes), `npm run deploy:hosting` is
faster.

## 8. Local development against emulators

Don't test against production data — it burns real quota and pollutes the
real leaderboard.

```bash
npm run emulators          # terminal 1: auth :9099, firestore :8080, UI :4000
npm run dev                # terminal 2
```

Set `VITE_FIREBASE_EMULATORS=true` in `.env.local` to point the SDK at
them. The emulator suite is bundled with `firebase-tools`, which is already
a dev dependency.

## 9. Lock down the API key

Optional, and worth ten minutes.

Google Cloud Console → **APIs & Services → Credentials** → your Browser
key → **Application restrictions → HTTP referrers**, then allow only:

```
https://<project-id>.web.app/*
https://<project-id>.firebaseapp.com/*
http://localhost:5173/*
```

This stops the key being reused to bill quota against your project from
somebody else's site. It is not a data protection measure — that is what
the rules are for.

---

## Staying inside the quota

The free tier's 20k writes/day is the number to respect. Three design
decisions keep the game far below it:

1. **One leaderboard document per player per level**, keyed by uid — never
   a row per attempt. The collection is bounded by player count, not by how
   much anyone plays, and it never needs pruning.
2. **Improvements only.** `firestore.rules` rejects an update whose score
   does not beat the stored one, and `profileStore` does not even send the
   request unless the run was a personal best. A player grinding the same
   level twenty times produces at most a handful of writes.
3. **Bounded reads.** Every board query is `limit(25)`. An unbounded
   collection read bills one document read per row, which is how a busy day
   takes the game offline until midnight UTC.

Rough capacity: a player finishing a level costs ~3 writes (level record,
player doc, leaderboard row). 20k writes/day is therefore on the order of
6,000 level completions a day before you need Blaze.

**Watch it** in Console → Firestore → **Usage**. Set a budget alert if you
ever move to Blaze.

---

## Hardening beyond Spark

Being straight about what the current setup does and does not guarantee.

The rules enforce that a submitted score is well-formed, in range, owned by
the submitter, server-timestamped, rate-limited, and an improvement on
their own previous score. That covers every casual attack.

What they **cannot** do is prove the score was actually earned. Someone who
opens the console can call the SDK with any in-range number. On Spark there
is no trusted tier to check it against, and that is an accepted trade.

If the leaderboard ever needs to be authoritative:

1. Upgrade to **Blaze** (still free under the same quotas; you are only
   billed past them).
2. Record a compact **replay log** per run — the seeded RNG (`src/core/rng.ts`)
   already makes runs deterministic, which is the hard half of this.
3. Move score submission to a **Cloud Function** that replays the log
   server-side, recomputes the score with the same `computeLevelScore`, and
   writes the row itself.
4. Change the leaderboard rules to `allow write: if false` so only the
   Function's admin credentials can write.

The client code is already shaped for this: scoring is a pure function over
a state and a run log, with no DOM or renderer in it.

---

## Troubleshooting

**"Missing or insufficient permissions" on a score submit.**
Usually correct behaviour: the rules reject a score that does not beat your
stored one. `submitScore` reports that as `not-a-personal-best`, not an
error. If it happens on a *first* submission, check Anonymous auth is
enabled (step 4).

**"The query requires an index."**
Run `npm run deploy:rules` — it deploys `firestore.indexes.json` too.

**The leaderboard says "offline" on the deployed site.**
The build had no Firebase config. Vite inlines `VITE_*` variables at build
time, so `.env.local` must exist *when you run the build*. Rebuild and
redeploy after creating it.

**Google sign-in fails with `auth/unauthorized-domain`.**
Console → Authentication → Settings → **Authorised domains**, add your
hosting domain.

**Sign-up fails with `auth/operation-not-allowed`.**
Email/Password isn't enabled. Step 4.

**A player signed up and lost their guest progress.**
Shouldn't happen — `signUpWithEmail` links the new credential to the
anonymous uid rather than creating a new one. If it does, check Anonymous
auth is enabled: with it off there is no session to link to, so a fresh
account is the only option.

**Password reset emails aren't arriving.**
Firebase sends them from a `@<project-id>.firebaseapp.com` address, which
often lands in spam. Console → Authentication → **Templates** to customise
the sender and wording.

**A blank page after deploying.**
Check the browser console. If it is a 404 on `/src/main.ts`, something is
linking a source path directly instead of importing through the bundle —
stylesheets in particular must be imported from `src/main.ts`, not
`<link>`ed in `index.html`.
