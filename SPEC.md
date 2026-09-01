# Learn Japan App — Technical Specification

Version 0.3.0 · last revised 2026-09-01

This document describes how the app is built and, more importantly, the
invariants a contributor must not break. The README explains what the app does;
this explains why it is put together the way it is.

---

## 1. Purpose and scope

### 1.1 Goal

A self-contained study tool for **English speakers learning Japanese**, covering
JLPT levels **N5 through N2**. It runs entirely in the browser with no backend,
no account and no network calls at runtime.

### 1.2 Target user

Someone who can read the Latin alphabet, may or may not know kana, and wants
both *recognition* (see Japanese, understand it) and *production* (have an idea,
say it in Japanese). The production half is the part most apps skip, so it gets
first-class treatment: the sentence builder and the EN → JP flashcard direction.

### 1.3 Non-goals

- **No handwriting or stroke-order practice.** Out of scope; other tools do it better.
- ~~No server, accounts or sync.~~ **Superseded in 0.3.0.** Accounts, admin
  approval and cross-device sync now exist — but without a backend of our own:
  Neon Auth issues the tokens and the browser talks to Postgres through the
  Neon Data API. The app is still a static bundle, deployable anywhere.
  With no auth configured it degrades to the original local-only learner.
- **No JLPT exam simulation.** Levels here organise difficulty; they are not a
  claim of exam coverage.
- **No machine translation at runtime.** Every English gloss is hand-written.

### 1.4 Design constraints

| Constraint | Consequence |
| --- | --- |
| Static hosting only | No build-time secrets, no API calls, relative asset base (`./`) |
| Works with zero setup | Audio degrades to the browser's speech synthesis when no clips are present |
| Content edited by hand | Data files are plain JS objects, readable and diff-friendly |
| Progress must survive content edits | Card ids derive from content, never from array position |

---

## 2. Architecture

```
index.html  →  src/main.jsx  →  src/App.jsx
                                   ├── state: level scope, furigana mode, theme
                                   ├── useProgress()  → localStorage
                                   └── one screen per tab

src/data/     content + derivation      (no React, importable from Node)
src/lib/      pure logic                (no React except Japanese.jsx)
src/components/  shared presentation
src/screens/  one file per tab
scripts/      offline tooling
```

The dependency rule is one-directional: `screens → components → lib → data`.
Nothing in `lib/` or `data/` imports React, which is what lets
`scripts/build_audio_manifest.mjs` import the content directly under Node.

`src/lib/audio.js` is the single exception that touches a browser-only global
(`import.meta.env.BASE_URL`), so it is never imported by `src/data/`.

---

## 3. Content model

### 3.1 Level files

`src/data/n5.js`, `n4.js`, `n3.js`, `n2.js` each default-export one object:

```js
{
  level: "N5",          // JLPT tag, also the id used everywhere
  name: "Foundations",  // short human label
  blurb: "…",           // one sentence, shown on the level chip tooltip
  vocab:     [ … ],
  grammar:   [ … ],
  dialogues: [ … ],
}
```

### 3.2 Vocabulary entry

```js
{ jp: "食[た]べる", en: "to eat", pos: "verb (ru)" }
```

| Field | Rule |
| --- | --- |
| `jp` | Japanese with furigana brackets. **Every kanji must carry a reading.** |
| `en` | English gloss. Multiple senses separated by `; `. Disambiguation in parentheses: `"old (of things)"`. |
| `pos` | One of: `noun`, `verb (u)`, `verb (ru)`, `verb (irr)`, `i-adj`, `na-adj`, `adverb`, `conjunction`, `question`, `expression` |

`kana` and `plain` are **derived**, never authored — see §3.6.

### 3.3 Grammar entry

```js
{
  key: "n5-temoii",                    // globally unique, prefixed by level
  pattern: "〜てもいいですか",          // the shape, as a learner would look it up
  en: "may I ~?",                      // short meaning
  formation: "V-te + もいいですか",     // how it is built, in EN/JP shorthand
  note: "…",                           // optional: caveat, contrast, register
  examples: [ { jp: "…", en: "…" } ],  // two, by convention
}
```

`note` is where a pattern earns its place — it should say something a
dictionary gloss would not, typically a contrast with a neighbouring pattern
(ように vs ために, かねない vs かねる) or a register warning.

### 3.4 Dialogue entry

```js
{
  key: "n5-konbini",
  title: "At the convenience store",   // English, used in listings
  jp: "コンビニで",                     // Japanese title, furigana-annotated
  setting: "Buying a bento on the way home.",
  a: "Clerk",                          // speaker A label
  b: "You",                            // speaker B label — always the learner
  lines: [ { s: "A" | "B", jp: "…", en: "…" } ],
}
```

**Invariant: the learner is always speaker B.** The UI renders B right-aligned
in the accent colour. A dialogue where the learner is A will read wrong.

### 3.5 Authoring conventions

Two conventions carry meaning and are enforced by tooling downstream:

**Furigana brackets.** A run of kanji is followed by its reading in square
brackets: `食[た]べる`, `今日[きょう]`, `一生懸命[いっしょうけんめい]`. The
bracket covers exactly the preceding kanji run, so okurigana stays outside:
`温[あたた]める`, not `温める[あたためる]`.

Regex: `/([一-鿿々〇〻]+)\[([^\]]+)\]/g`

**Bunsetsu spaces.** ASCII spaces inside a Japanese sentence mark phrase
boundaries. They are **never rendered** — every display path strips them. Their
only job is to tell the sentence builder where to cut tiles:

```
"駅[えき]まで 歩[ある]きます。"  →  tiles: ["駅まで", "歩きます。"]
```

Author them the way you would chunk the sentence when reading aloud. Too few
makes the builder trivial; too many makes it fiddly. Three to nine chunks is the
range the builder accepts.

### 3.6 Derived forms

`src/lib/furigana.js` produces four views of one authored string:

| Function | `"お弁当[べんとう]を 温[あたた]めて"` becomes | Used for |
| --- | --- | --- |
| `segments()` | ruby nodes | on-screen furigana |
| `stripFurigana()` | `お弁当を温めて` | kanji-only display mode, ids |
| `toKana()` | `おべんとうをあたためて` | all-kana display mode |
| `toSpeech()` | `お弁当を温めて` | audio manifest, speech synthesis |
| `toChunks()` | `["お弁当[べんとう]を", "温[あたた]めて"]` | builder tiles |

`toSpeech` keeps the kanji deliberately: VOICEVOX reads kanji with better pitch
accent than bare kana, where it cannot tell 箸 from 橋.

### 3.7 Derived collections

`src/data/index.js` aggregates the four level files and exports:

- `vocab`, `grammar`, `dialogues` — flattened, with ids and derived fields added
- `sentences` — the production bank, built from **every dialogue line plus every
  grammar example**, deduplicated by content hash. Roughly 320 entries.
- `audioPhrases()` — every distinct speakable phrase, for the manifest script
- `LEVELS`, `TOTALS`, `byLevel(items, levels)`

---

## 4. Identity and stability

**Invariant: an id must not change when unrelated content is edited.** If ids
moved with array position, inserting a word at the top of the N5 list would
silently hand every learner's review history to the wrong card.

| Kind | Id | Derived from |
| --- | --- | --- |
| Vocabulary | `v:N5:食べる` | level + `stripFurigana(jp)` |
| Grammar | `n5-temoii` | the hand-written `key` |
| Dialogue | `n5-konbini` | the hand-written `key` |
| Dialogue line | `n5-konbini:3` | dialogue key + index |
| Sentence | `s:d8d22bb0` | FNV-1a hash of the plain text |
| Kana | `k:hiragana:か` | script + character |
| Audio clip | `d8d22bb0.wav` | FNV-1a hash of the speech form |

Consequences a contributor should know:

- **Editing a word's kanji creates a new card.** The old history is orphaned.
  That is correct — it is a different word now.
- **Editing an English gloss changes nothing.** Ids ignore the gloss.
- **Reordering anything is free.**
- **Changing a grammar or dialogue `key` orphans it.** Treat keys as permanent.

---

## 5. Spaced repetition

`src/lib/srs.js`. A trimmed SM-2 — enough to schedule honestly without the
complexity of a full implementation.

### 5.1 Card

```js
{ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: <ms>, seen: 0 }
```

`interval` is in days. `seen` counts every grading, and is what distinguishes
*never met* from *met and forgotten* — `reps` alone cannot, because a lapse
resets it.

### 5.2 Grading

| Grade | Ease | Interval | Due |
| --- | --- | --- | --- |
| **Again** (0) | −0.20 | reset to 0, `lapses++`, `reps = 0` | +8 minutes |
| **Hard** (1) | −0.15 | new card: 0.5 d · else `max(1, interval × 1.2)` | +interval |
| **Good** (2) | — | 1 d → 3 d → `interval × ease` | +interval |
| **Easy** (3) | +0.15 | 2 d → 5 d → `interval × ease × 1.3` | +interval |

Ease clamps to `[1.3, 3.0]`; interval caps at 365 days and rounds to one decimal.

The eight-minute Again delay is the one deliberate departure from a pure daily
scheduler: a card you just failed should come back inside the same session, not
tomorrow.

### 5.3 Stages

```
new       seen === 0
learning  reps === 0 (lapsed) or interval < 1
review    1 ≤ interval < 21
mastered  interval ≥ 21
```

### 5.4 Queue

`buildQueue(items, cards, { limit = 20, newLimit = 8 })`

1. Split into **due** (`seen > 0 && due ≤ now`) and **fresh** (`seen === 0`).
2. Sort due by due time — most overdue leads.
3. Take up to `limit − min(newLimit, fresh.length)` due cards, then up to
   `newLimit` fresh ones.

Due cards always outrank new material, and a session stays finishable.

---

## 6. Audio

### 6.1 Fallback chain

```
public/audio/<hash>.wav  →  browser speechSynthesis (ja-JP)  →  silence
```

A missing clip is cached in an in-memory `Set` after the first failed `play()`,
so a phrase never costs more than one failed request per page load.

### 6.2 Pipeline

```
src/data/*.js
    │  node scripts/build_audio_manifest.mjs
    ▼
scripts/audio_manifest.json      [{ id: "d8d22bb0", text: "お弁当を温めて" }, …]
    │  python scripts/voicevox_batch_synth.py
    ▼
public/audio/d8d22bb0.wav
```

Because the id is a hash of the text, the synthesiser skips anything already on
disk. A content edit costs only the phrases that actually changed.

Hash: FNV-1a 32-bit, 8 hex digits. At the current ~680 phrases there are no
collisions; the birthday bound puts the risk near 1 in 10⁴ even at 10× that
size. If the corpus grows past a few thousand phrases, widen the hash rather
than hoping.

### 6.3 Licensing note

VOICEVOX output carries the voice character's own terms — most require crediting
the character (e.g. `VOICEVOX:ずんだもん`) wherever the audio is published. Those
terms are separate from this repository's MIT licence. Check the character's
terms before redistributing rendered clips.

---

## 7. Persistence

`localStorage`, all keys prefixed `learn-japan:` and **namespaced by scope** —
`guest` or `u:<user id>`. Two accounts on one browser never see each other's
progress, and signing out does not destroy what a guest built up.

For a signed-in learner localStorage is a cache, not the record of truth:
Postgres is. Writes land locally first and flush on a 1.5 s debounce. Every read and write is
wrapped — a browser in private mode or with storage disabled degrades to
in-memory state for the session rather than throwing.

| Key | Shape |
| --- | --- |
| `learn-japan:<scope>:cards` | `{ [cardId]: Card }` |
| `learn-japan:<scope>:log` | `{ "2026-09-01": { reviews: 12, correct: 9 } }` |
| `learn-japan:<scope>:levels` | `["N5", "N4"]` |
| `learn-japan:<scope>:furigana` | `"on" \| "off" \| "kana"` |
| `learn-japan:<scope>:theme` | `"light" \| "dark"` |

Day keys are **local calendar days**, not UTC — a streak should roll over at the
learner's midnight.

---

## 8. Accounts, roles and access control

Added in 0.3.0. Optional: with no `VITE_STACK_*` values the app has no accounts
at all and none of this applies.

### 8.1 Pieces

| Piece | Job |
| --- | --- |
| **Neon Auth** (Stack Auth) | Issues and refreshes the JWT. Mirrors users into `neon_auth.users_sync`. |
| **Neon Data API** (PostgREST) | Exposes Postgres over REST. Verifies the JWT and sets `auth.user_id()`. |
| **Postgres RLS + grants** | The only thing enforcing who may read or write what. |

There is **no backend of ours**. The browser holds a token and talks to Postgres
directly, which is what keeps the app a static bundle.

### 8.2 The consequence that shapes everything

Anything the `authenticated` role is permitted to do, a user can do by hand with
curl and their own token. The UI is not a security boundary — it is a
convenience over an API that is fully exposed.

Concretely: a policy of `for all using (user_id = auth.user_id())` on
`profiles` would let anyone PATCH their own row with
`{"role":"admin","status":"approved"}`. Admin approval would be theatre.

### 8.3 How privilege is actually held

Two mechanisms, deliberately layered:

1. **Column-level grants.** `authenticated` may UPDATE only
   `display_name, levels, furigana, theme`. `role` and `status` are not
   granted, and INSERT/DELETE on `profiles` are revoked outright. A grant sits
   *underneath* RLS: no policy can hand back what the grant withholds, so a
   future careless policy cannot reopen this.
2. **SECURITY DEFINER functions.** Every privileged action is an RPC that
   re-checks `is_admin()` in its own body, with a pinned `search_path`.

```
ensure_profile()                    creates the profile; the SERVER picks role/status
admin_list_accounts()               all accounts + per-account study counts
admin_set_status(user, status)      approve / suspend
admin_set_role(user, role)          promote / demote
admin_reset_progress(user | null)   wipe one learner, or everyone
admin_stats()                       counts for the console
```

A SECURITY DEFINER function runs as the table owner. **Omitting the `is_admin()`
check in any one of them hands the whole table to every signed-in user** —
`db/checks.sql` check 7 exists to catch exactly that.

Both admin mutators refuse when `target_user = auth.user_id()`. An admin who
suspended or demoted themselves would leave nobody able to undo it.

### 8.4 States

```
signed out ──────────────────────────► landing page
     │ create account
     ▼
status = pending ────────────────────► "waiting for approval"
     │ admin approves                    (no study data reachable: RLS refuses)
     ▼
status = approved, role = user ──────► the learner app
status = approved, role = admin ─────► the admin console, and nothing else
status = suspended ──────────────────► "account suspended" (history retained)
```

An admin has no learner UI by design: the role exists to administer accounts,
not to study. Study tables are gated on `is_approved()`, so a pending account
cannot write a single card even by calling the API directly.

### 8.5 Bootstrapping the first admin

`public.admin_allowlist` holds emails that become approved admins on first
sign-in. Without it a fresh deployment would have every account pending and
nobody able to approve anything. The table has no grants to `authenticated`,
so it is invisible and unwritable from the browser.

### 8.6 Operational trap: the schema cache

**Neon's Data API caches the Postgres schema and does not notice new
functions.** Until it is reloaded, every `/rpc/` call answers `404 "Could not
find the function ... in the schema cache"`, which reads like a permissions
failure and is not one.

`NOTIFY pgrst, 'reload schema'` does not reach it. Restarting the compute
endpoint does not either. **Touching the Data API configuration does** — save
its settings in the Neon console, or call `update_data_api`.

This matters for verification as much as for deployment: a 404 proves nothing
about your access rules. Re-run the checks after reloading, and only trust a
`400 "admin privileges required"` as evidence the guard works.

---

## 9. Screens

| Tab | Reads | Writes |
| --- | --- | --- |
| Today | cards, log | — (reset only) |
| Dialogues | dialogues | — |
| Grammar | grammar | — |
| Vocabulary | vocab, cards | cards, log |
| Build | sentences | log |
| Quiz | vocab, grammar | log |
| Kana | kana deck | — |

**Only the Vocabulary screen moves the SRS schedule.** Quiz and Build feed the
streak through `record()` but never touch card intervals — otherwise a lucky
multiple-choice guess would push a word you cannot produce three weeks out.

The level chips in the header scope every screen. Build and Quiz remount on a
level change (via React `key`) so a half-finished round cannot mix scopes.

---

## 10. Theming

CSS custom properties on `:root`, with `:root[data-theme="dark"]` overriding the
token values only. No component hard-codes a colour; adding a third theme means
adding one block of tokens.

Japanese text uses a font stack that prefers installed Japanese faces
(Hiragino, Yu Gothic, Noto Sans JP, Meiryo) before falling back to the system
UI font. No web font is loaded — a 2 MB Japanese font file is a poor trade for
a study tool that must work offline.

---

## 11. Build and deploy

Vite 5, React 18, `lucide-react` for icons. No CSS framework, no state library,
no router — the tab state is a single `useState`.

`base: "./"` in `vite.config.js` makes the build path-independent, so it works
from a GitHub Pages project subpath without configuration. This is only safe
because the app has no client-side routing.

```bash
npm run dev              # localhost:5173
npm run build            # → dist/
npm run preview          # serve the production build
npm run audio:manifest   # regenerate the manifest from src/data
npm run deploy           # build + publish dist/ to the gh-pages branch
```

---

## 12. Verification

There is no test runner yet. What is currently checked, and how:

- **Content integrity** — a Node one-liner over `src/data/index.js` asserting
  no duplicate ids, no missing `en`/`pos`, balanced furigana brackets, and no
  kanji left without a reading.
- **Scheduler** — direct calls to `review()` / `buildQueue()` under Node,
  including the lapse path.
- **UI** — manual pass over every screen in both themes.
- **Access rules** — `db/checks.sql` (7 assertions on grants, RLS and the admin
  functions) plus a live probe with a real JWT: a signed-in *pending* user must
  get 403 on `PATCH /profiles {role}`, 403 on writing `srs_cards`, and
  `400 "admin privileges required"` from every `/rpc/admin_*`.

  The live half is not optional. A stale Data API schema cache answers 404 to
  every RPC, which looks like a refusal but proves nothing — see §8.6.

The first two are the obvious candidates for a real test suite; see §13.

---

## 13. Open items

Ordered roughly by value per unit of work.

1. **Test suite.** Vitest over the content-integrity assertions and `srs.js`.
   Both are pure functions with no DOM — cheap to cover, and they are exactly
   where a silent regression would hurt.
2. **Content depth.** N2 has the fewest words (73) and N5 the most (104); the
   upper levels deserve to catch up. Kanji-specific study (readings, compounds)
   is absent entirely.
3. **Settings sync is one-way.** Level scope, furigana mode and theme are
   pushed to `profiles` but never pulled back, so a second device starts from
   defaults. Pulling them needs a rule for which side wins on first sign-in.
4. **Typing input.** The builder tests word order but not recall of the
   characters themselves. A romaji-to-kana input would close that gap.
5. **Per-sentence SRS.** The sentence bank is currently sampled at random.
   Scheduling it like the vocabulary would make the Build tab compound.
6. **Audio compression.** A full VOICEVOX render is a few hundred WAV files.
   Converting to Opus or AAC before committing would cut it by an order of
   magnitude.
7. **Admin console is MVP-thin.** It lists accounts, approves, suspends,
   promotes and resets progress. No audit log of who approved whom (the
   `approved_by` column is written but never shown), no pagination, no
   invitations, no password reset flow for a locked-out learner.
8. **No email verification.** `signUpWithCredential` is called with
   `noVerificationCallback`, so an address is never proven. Admin approval is
   the only gate, which is adequate for a closed group and not for open signup.
