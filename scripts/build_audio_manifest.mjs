// Regenerates scripts/audio_manifest.json from the content in src/data/.
//
//   node scripts/build_audio_manifest.mjs
//
// Every distinct phrase the app can speak gets one entry. The id is a hash of
// the phrase itself, so adding, reordering or deleting content never renames
// the .wav files that already exist — only genuinely new phrases show up as
// new work for the VOICEVOX script.
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// A file:// URL, not a bare path — Windows drive letters are otherwise read
// as a package specifier.
const { audioPhrases, TOTALS } = await import(pathToFileURL(join(here, "../src/data/index.js")).href);

const manifest = audioPhrases().sort((a, b) => a.id.localeCompare(b.id));
const out = join(here, "audio_manifest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(
  `Wrote ${manifest.length} phrases to scripts/audio_manifest.json`,
  `\n  from ${TOTALS.vocab} words, ${TOTALS.grammar} grammar points, ${TOTALS.dialogues} dialogues`
);
