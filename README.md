# Learn Japan App

**An open source app for learning Japanese, from English, across JLPT N5 to N2.**

[![License: MIT](https://img.shields.io/badge/License-MIT-2a3f5f.svg)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/built%20with-Vite%20%2B%20React-b3441e.svg)](https://vitejs.dev/)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-40704f.svg)](#contributing)

Free, open source, and free of the things that usually come attached: no
account, no server, no tracking, no streak guilt-tripping, no paywall on the
useful half. Everything runs in your browser and your progress stays in your
browser.

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
npm run deploy    # publish dist/ to the gh-pages branch
```

Then set **Settings → Pages → Source** to the `gh-pages` branch. The Vite base
is `./`, so the app works from a project subpath with no extra configuration.

A full set of VOICEVOX clips is a few hundred WAV files. If repository size
matters, either leave `public/audio/` out of version control and let the browser
voice handle playback, or compress the clips before committing.

## Project layout

```
src/
  data/          n5.js n4.js n3.js n2.js — all content
                 kana.js   — syllabary tables (katakana derived from hiragana)
                 index.js  — aggregation, id derivation, sentence bank
  lib/           furigana.js  ruby parsing and the kana/plain/speech forms
                 srs.js       scheduling
                 audio.js     clip playback with browser-voice fallback
                 hash.js      content-addressed audio keys
                 storage.js   namespaced localStorage
  components/    Japanese.jsx (ruby + speak button), ui.jsx (shared atoms)
  screens/       one file per tab
scripts/
  build_audio_manifest.mjs   regenerates audio_manifest.json from src/data
  voicevox_batch_synth.py    renders the manifest into public/audio/
```

[`SPEC.md`](SPEC.md) documents the data model, the scheduler, the audio pipeline
and the invariants in full.

## Tech

React 18 · Vite 5 · `lucide-react` for icons. No CSS framework, no state
library, no router, no backend. Bundle is ~90 kB gzipped.

## Licence

[MIT](LICENSE) — code and hand-written content alike. Use it, fork it, teach
with it. VOICEVOX-rendered audio carries its own separate terms, noted above.
