// FNV-1a 32-bit. Used to derive a stable, filesystem-safe key from a Japanese
// phrase so an audio file is addressed by its content, not by its position in
// the data files. Reordering or inserting content never orphans a .wav.
// Shared by the app and scripts/build_audio_manifest.mjs, so both must agree.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function audioKey(text) {
  return fnv1a(text).toString(16).padStart(8, "0");
}
