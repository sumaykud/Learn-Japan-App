# Learn Japan App

**An open source app for learning Japanese, from English, across JLPT N5 to N2.**

[![License: MIT](https://img.shields.io/badge/License-MIT-2a3f5f.svg)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/built%20with-Vite%20%2B%20React-b3441e.svg)](https://vitejs.dev/)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-40704f.svg)](#contributing)

Free, open source, and free of the things that usually come attached: no
tracking, no streak guilt-tripping, no paywall on the useful half.

Clone it and it runs entirely in your browser with nothing to configure. Point
it at a Neon database and it grows accounts, admin approval and cross-device
sync — still with no backend of your own to run.

Dialogues, grammar, spaced-repetition vocabulary and sentence building — 358
words, 78 grammar patterns, 18 full dialogues and 321 practice sentences, all
hand-written rather than machine-translated.

```bash
git clone https://github.com/sumaykud/Learn-Japan-App.git
cd Learn-Japan-App
npm install
npm run dev        # http://localhost:5173
```

---

## Why this exists

Most Japanese apps train **recognition** — you see 食べる, you tap "to eat". That
skill collapses the moment you have to say something. This one gives equal
weight to **production**: you get the English, and you have to build the
Japanese.

That shows up in three places: the EN → JP flashcard direction, the sentence
builder, and the Production quiz mode.

## What's in it

| Section | What it does |
| --- | --- |
| **Today** | What's due, your streak, a 14-day activity strip, and where every word sits in the review schedule. |
| **Dialogues** | 18 full scenes with audio, per-line playback and a play-the-whole-scene button. You are always speaker B. |
| **Grammar** | 78 patterns with formation notes, usage caveats and two worked examples each. Searchable. |
| **Vocabulary** | 358 words as spaced-repetition flashcards, in either direction — JP → EN for recognition, EN → JP for production. |
| **Build** | Read an English sentence, assemble the Japanese from shuffled bunsetsu tiles. 321 sentences drawn from the dialogues and grammar examples. |
| **Quiz** | Four modes: meaning, production, listening, and matching a grammar pattern to its use. |
| **Kana** | Hiragana and katakana charts (basic, voiced, combined) with audio, plus a multiple-choice drill. |

Three display modes for Japanese text — furigana above the kanji, kanji only, or
everything in kana — plus a dark theme. Switchable anywhere, applied everywhere.

### Content by level

| Level | Focus | Words | Patterns | Dialogues |
| --- | --- | --- | --- | --- |
| **N5** | Foundations — particles, greetings, shopping, directions | 104 | 20 | 5 |
| **N4** | Everyday fluency — conditionals, plans, opinions | 93 | 22 | 5 |
| **N3** | Nuance and register — aspect auxiliaries, first real keigo | 88 | 18 | 4 |
| **N2** | Business and argument — formal connectives, hedged assertions | 73 | 18 | 4 |

The N5–N2 chips in the header choose which levels are in scope. Every screen
respects that selection.

## Spaced repetition

Flashcards use a trimmed SM-2: an ease factor per card, four grades, intervals
in days. **Again** reschedules eight minutes out, so a card you just failed comes
back inside the same session rather than disappearing until tomorrow. A card
counts as mastered once its interval passes 21 days.

Only the Vocabulary screen moves the schedule. Quiz and Build feed your streak
but never touch card intervals — a lucky multiple-choice guess should not push a
word you cannot produce three weeks into the future.

Details in [`SPEC.md` §5](SPEC.md); the code is [`src/lib/srs.js`](src/lib/srs.js).

## Accounts and sync (optional)

Out of the box there are no accounts: progress lives in your browser and the app
works offline. Adding three environment values turns on a second mode.

| | Without `.env` | With `.env` |
| --- | --- | --- |
| Entry point | Straight into the app | Landing page, sign in required |
| Progress | localStorage only | Postgres, synced across devices |
| New accounts | — | Wait for an administrator to approve |
| Roles | — | `user` studies · `admin` manages accounts |

### How it fits together

```
browser ──JWT──► Neon Auth (Stack Auth)      issues and refreshes the token
   │
   └──REST──────► Neon Data API (PostgREST) ──► Postgres
                                                 Row Level Security decides
                                                 what that token may touch
```

There is no server of ours in the middle, which is why the app stays a static
bundle you can host anywhere.

### Setting it up

1. Create a Neon project, then enable **Neon Auth** and the **Data API** on its
   default branch.
2. Apply the migrations in order:
   ```bash
   psql "$DATABASE_URL" -f db/migrations/001_init.sql
   ```
   ```bash
   psql "$DATABASE_URL" -f db/migrations/002_roles_and_approval.sql
   ```
   ```bash
   psql "$DATABASE_URL" -f db/migrations/003_superadmin.sql
   ```
   ```bash
   psql "$DATABASE_URL" -f db/migrations/004_account_deletion.sql
   ```
   ```bash
   psql "$DATABASE_URL" -f db/migrations/005_superadmin_setup.sql
   ```
3. Copy `.env.example` to `.env` and fill in the three values.
4. **Reload the Data API schema cache** — see the warning below.
5. `npm run dev`
6. Create the first superadmin — see [One-time superadmin setup](#one-time-superadmin-setup).

> **The one thing that will trip you up.** Neon's Data API caches the Postgres
> schema and does *not* pick up new functions on its own. Until you reload it,
> every `/rpc/` call answers `404 "Could not find the function ... in the schema
> cache"` — which reads like a permissions error but is not one. `NOTIFY pgrst,
> 'reload schema'` will not do it, and neither will restarting the compute.
> Saving the Data API settings in the Neon console does. Repeat after any
> migration that touches a function.

### Two entrances

| URL | Signed out | Learner (`user`) | Admin or superadmin |
| --- | --- | --- | --- |
| `/` | Landing page with sign in / create account | The learning dashboard | Redirected to `/admin` |
| `/admin` | Administrator sign-in | "Not an administrator" | The admin console |
| `/admin/setup` | Step 1: create an account | Step 2: enter the setup code — or "already complete" | "Already complete" |

Both administrator tiers share `/admin`; what differs is which controls the
console offers them. An administrator has no learner interface, so `/` has
nothing to show them and sends them on. A learner who opens `/admin` is told
plainly rather than silently bounced, which would look like a broken link.

**The URL protects nothing.** Anyone may open `/admin`; what stops them is that
the admin functions refuse a caller who is not an admin. The split exists so the
two audiences get the right front door, not as a security boundary.

### One-time superadmin setup

A fresh deployment has no administrators at all, so the first superadmin is
made once, by whoever controls the database:

1. In the Neon SQL editor (or psql), mint a code:
   ```sql
   select public.create_superadmin_setup_code();
   ```
   It returns something like `3F9A1C0E-7B24D6A1-4E8F0B3C-92D5A7E1`, valid for
   24 hours. Only its hash is stored. Minting again revokes the previous one.
2. Open **`/admin/setup`** on the site, create an account (or sign in to one),
   and enter the code.
3. That account becomes an approved superadmin and the code stops working.

After that the door is closed: both minting and claiming refuse while any
superadmin exists, and further administrators are appointed in the console.
`/admin/setup` is not linked from anywhere, and knowing the URL is worthless
without a code.

**Why a code and not an email allowlist.** Earlier versions promoted whichever
account signed up with the owner's address. This project's Stack Auth does not
verify email ownership before sign-in, so anyone who knew the address — and it
was committed to this public repository — could have signed up as it first. A
code proves the one thing that matters: that you can run SQL on the database.

### What each role can do

Administrator accounts have **no learning interface at all** — the roles exist
to manage accounts, not to study. The console lists every account with its
status and study volume.

| | Admin | Superadmin |
| --- | :---: | :---: |
| Approve and suspend learners | ✓ | ✓ |
| Move accounts between learner and admin | ✓ | ✓ |
| Appoint or remove superadmins | | ✓ |
| Change anything about a superadmin account | | ✓ |
| Reset one learner's progress | | ✓ |
| Reset every account's progress | | ✓ |
| Delete an account | | ✓ |

An ordinary admin moderates; nothing an admin can do destroys data. Every
destructive operation belongs to the superadmin, and the database enforces each
row of that table itself — the console only hides buttons that would fail.

Nobody can change their own role or status, or delete themselves. The last
remaining superadmin cannot be demoted, suspended or deleted either, so the
tier can never empty itself from inside the app. (If it were ever emptied by
hand in SQL, the one-time setup opens again — still requiring database access.)

**What "delete" removes.** Deleting an account erases every row this app holds
about the person — profile, cards, review history — and records a tombstone so
their next sign-in is refused instead of silently recreating them. Their
**Stack Auth login is not removed**: that needs Stack's secret server key, and a
static site with no server of its own has nowhere safe to keep one. So they can
still authenticate, see "Account deleted", and do nothing else; and the same
email cannot sign up again. To remove the login too, delete the user in the
Neon console under Auth → Users.

### Verifying the access rules

The security model lives in Postgres, so it can be checked there:

```bash
psql "$DATABASE_URL" -f db/checks.sql
```

Twenty assertions covering grants, RLS, both administrator tiers, account
deletion and the one-time setup; all should say PASS. Function privileges are
checked with `has_function_privilege()`, because a new function here is callable
through two grants at once — Postgres gives EXECUTE to `PUBLIC`, and Neon's
default privileges give it to `authenticated` — and revoking one leaves the
other. That does **not** cover the live API, so also confirm with a real token
that a signed-in *pending* user gets:

- `403` on `PATCH /profiles` with `{"role":"admin"}` — no self-promotion
- `403` on writing `srs_cards` — no studying before approval
- `400 "admin privileges required"` from `/rpc/admin_list_accounts`,
  `admin_stats`, `admin_set_role` and `admin_set_status`
- `400 "superadmin privileges required"` from `/rpc/admin_delete_account` and
  `admin_reset_progress` — and the same from an ordinary *admin's* token
- `400 "invalid or expired setup code"` from `/rpc/claim_superadmin` with a
  made-up code, and `400 "setup already completed"` once a superadmin exists
- a refusal from `/rpc/create_superadmin_setup_code` — minting is for the
  database owner only

A `404` from an `/rpc/` endpoint means a stale schema cache, not a refusal.
Reload it and test again before believing the rules hold.

### Why it is built this way

Because the browser talks to Postgres directly, **anything the `authenticated`
role may do, a user can do with curl**. The UI is not a security boundary.

So `role` and `status` are revoked from that role at the column level — a grant
sits underneath RLS, and no future policy can hand back what the grant
withholds. Every privileged action is a `SECURITY DEFINER` function that
re-checks admin membership itself. `db/migrations/002_roles_and_approval.sql`
opens with the full reasoning; [`SPEC.md` §8](SPEC.md) has the rest.

## Natural-sounding audio (optional)

Out of the box the speaker buttons use your browser's own Japanese voice, which
works everywhere and sounds robotic. For real synthesis, render the clips once
with [VOICEVOX](https://voicevox.hiroshiba.jp/), a free Japanese speech engine.

1. Install and open the VOICEVOX desktop app — opening it starts a local engine
   on `http://127.0.0.1:50021`.
2. `pip install requests`
3. `python scripts/voicevox_batch_synth.py`

```bash
python scripts/voicevox_batch_synth.py --list                 # show every voice
python scripts/voicevox_batch_synth.py --speaker 四国めたん     # pick a character
python scripts/voicevox_batch_synth.py --speed 0.9            # slow it down
python scripts/voicevox_batch_synth.py --force                # re-render all
```

The app prefers a rendered clip and silently falls back to the browser voice for
anything missing, so a partial run is perfectly usable.

> **Note on VOICEVOX licensing.** Rendered audio carries the voice character's
> own terms, which usually require crediting the character (e.g.
> `VOICEVOX:ずんだもん`) wherever the audio is published. Those terms are separate
> from this repository's MIT licence — check them before redistributing clips.

Clip filenames are a hash of the phrase itself, so adding or reordering content
never renames existing files. After a content change:

```bash
npm run audio:manifest
python scripts/voicevox_batch_synth.py    # renders only what is new
```

---

## Contributing

Contributions are welcome, and **content contributions are the most valuable
kind** — more N2 vocabulary, more dialogues, sharper grammar notes. You do not
need to touch React to help.

### Adding content

Each level is one file: [`src/data/n5.js`](src/data/n5.js) and its siblings.
They share a shape — `vocab`, `grammar`, `dialogues` — and two authoring
conventions that the rest of the app depends on:

**Furigana** goes in square brackets after the kanji run. Every kanji needs a
reading; okurigana stays outside the bracket.

```js
{ jp: "温[あたた]める", en: "to heat up", pos: "verb (ru)" }   // correct
{ jp: "温める[あたためる]", … }                                  // wrong
```

**Spaces separate bunsetsu** inside a sentence. They are never rendered — the
sentence builder cuts its tiles on them.

```js
{ jp: "駅[えき]まで 歩[ある]きます。", en: "I walk to the station." }
// builder tiles: 駅まで / 歩きます。
```

Chunk sentences the way you would when reading aloud. Three to nine chunks is
the range the builder accepts.

Ids are derived from the content, so inserting a word in the middle of a list
will not reassign anyone's review history. See [`SPEC.md` §4](SPEC.md) for the
exact rules on what does and does not orphan a card.

### Before opening a pull request

```bash
npm run build              # must pass
npm run audio:manifest     # if you touched src/data/
```

Sanity-check your content with:

```bash
node --input-type=module -e "
const d = await import('./src/data/index.js');
console.log(d.TOTALS);
const all = [...d.vocab.map(v => v.jp), ...d.dialogues.flatMap(x => x.lines.map(l => l.jp))];
const bad = all.filter(t => /[一-鿿](?!\[)/.test(t.replace(/[一-鿿々]+\[[^\]]+\]/g, '')));
console.log('kanji missing furigana:', bad.length, bad.slice(0, 5));
"
```

Japanese accuracy matters more than volume here. If you are unsure whether a
sentence sounds natural, say so in the pull request — a flagged uncertainty is
far more useful than a confident mistake.

### Reporting problems

Wrong reading, unnatural phrasing, a gloss that misleads — please open an issue.
Include the level, the entry, and what it should be.

## Build and deploy

```bash
npm run build     # → dist/
npm run preview   # serve the production build locally
```

### Vercel

Import the repository, keep the detected Vite preset, and add the three `VITE_`
values from `.env.example` — to **Production, Preview and Development alike**.
Splitting them across environments leaves production with a partial config; the
app then falls back to guest mode or stops at an error naming what is missing.

`vercel.json` already rewrites unknown paths to `index.html`, which is what lets
someone refresh on `/admin` instead of getting a 404.

### Anywhere else

The app is static files. Two requirements:

1. **Serve `index.html` for unknown paths.** Without it `/admin` 404s on
   refresh.
2. **Serve from the root**, or set Vite's `base` to your sub-path. `base` is
   `/` rather than `./` because a relative base makes assets under `/admin`
   resolve to `/admin/assets/…`. The router reads `import.meta.env.BASE_URL`, so
   a sub-path works once `base` matches it.

> GitHub Pages project sites need both: set `base` to `"/<repo-name>/"` and add
> the usual `404.html` copy of `index.html` for the SPA fallback. This used to
> work with no configuration, before `/admin` existed.

A full set of VOICEVOX clips is a few hundred WAV files. If repository size
matters, either leave `public/audio/` out of version control and let the browser
voice handle playback, or compress the clips before committing.

## Project layout

```
db/
  migrations/    001 schema + RLS · 002 roles, approval, admin functions
  checks.sql     assertions the access rules must satisfy
src/
  data/          n5.js n4.js n3.js n2.js — all content
                 kana.js   — syllabary tables (katakana derived from hiragana)
                 index.js  — aggregation, id derivation, sentence bank
  lib/           furigana.js  ruby parsing and the kana/plain/speech forms
                 srs.js       scheduling
                 audio.js     clip playback with browser-voice fallback
                 hash.js      content-addressed audio keys
                 storage.js   namespaced localStorage
  lib/auth/      Stack Auth client (lazy-loaded), session and profile hooks
  lib/sync/      Data API wrapper, merge rules, admin RPCs
  components/    Japanese.jsx (ruby + speak button), ui.jsx (shared atoms)
  screens/       one file per tab, plus landing, gate and admin console
scripts/
  build_audio_manifest.mjs   regenerates audio_manifest.json from src/data
  voicevox_batch_synth.py    renders the manifest into public/audio/
```

[`SPEC.md`](SPEC.md) documents the data model, the scheduler, the audio pipeline
and the invariants in full.

## Tech

React 18 · Vite 5 · `lucide-react` for icons. No CSS framework, no state
library, no router, no backend of our own.

The learner bundle is ~99 kB gzipped. The Stack Auth SDK is another ~129 kB and
loads dynamically, so a build with no accounts configured never fetches it.

## Licence

[MIT](LICENSE) — code and hand-written content alike. Use it, fork it, teach
with it. VOICEVOX-rendered audio carries its own separate terms, noted above.
