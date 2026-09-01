"""Batch-render the app's Japanese audio with VOICEVOX.

VOICEVOX (https://voicevox.hiroshiba.jp/) is a free Japanese speech engine.
Opening the desktop app starts a local HTTP server on 127.0.0.1:50021; this
script drives that server once per phrase and writes the result into
public/audio/, where the web app looks for it.

Usage
-----
    pip install requests
    node scripts/build_audio_manifest.mjs      # keep the manifest in sync
    python scripts/voicevox_batch_synth.py

    python scripts/voicevox_batch_synth.py --speaker 四国めたん --style ノーマル
    python scripts/voicevox_batch_synth.py --list          # show every voice
    python scripts/voicevox_batch_synth.py --force         # re-render everything

Files are named by the manifest id, which is a hash of the phrase itself, so
re-running after a content change only renders what is genuinely new. The app
falls back to the browser's own voice for anything not yet rendered, so a
partial run is perfectly usable.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover - dependency hint
    sys.exit("Missing dependency. Run:  pip install requests")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts" / "audio_manifest.json"
OUTPUT_DIR = ROOT / "public" / "audio"
ENGINE_URL = "http://127.0.0.1:50021"

DEFAULT_SPEAKER = "ずんだもん"
DEFAULT_STYLE = "ノーマル"


def fetch_speakers(engine: str):
    resp = requests.get(f"{engine}/speakers", timeout=10)
    resp.raise_for_status()
    return resp.json()


def resolve_speaker(speakers, name: str, style: str):
    for sp in speakers:
        if name in sp["name"]:
            for st in sp["styles"]:
                if style in st["name"]:
                    return st["id"], sp["name"], st["name"]
            first = sp["styles"][0]
            return first["id"], sp["name"], first["name"]

    available = ", ".join(sp["name"] for sp in speakers)
    sys.exit(f"Voice {name!r} not found.\nAvailable: {available}")


def synthesize(engine: str, text: str, speaker_id: int, speed: float) -> bytes:
    query = requests.post(
        f"{engine}/audio_query", params={"text": text, "speaker": speaker_id}, timeout=30
    )
    query.raise_for_status()
    payload = query.json()
    payload["speedScale"] = speed

    audio = requests.post(
        f"{engine}/synthesis", params={"speaker": speaker_id}, json=payload, timeout=120
    )
    audio.raise_for_status()
    return audio.content


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--speaker", default=DEFAULT_SPEAKER, help=f"character name (default: {DEFAULT_SPEAKER})")
    parser.add_argument("--style", default=DEFAULT_STYLE, help=f"voice style (default: {DEFAULT_STYLE})")
    parser.add_argument("--speed", type=float, default=0.95, help="speaking rate, 1.0 is normal (default: 0.95)")
    parser.add_argument("--engine", default=ENGINE_URL, help="VOICEVOX engine URL")
    parser.add_argument("--list", action="store_true", help="list available voices and exit")
    parser.add_argument("--force", action="store_true", help="re-render clips that already exist")
    args = parser.parse_args()

    try:
        speakers = fetch_speakers(args.engine)
    except requests.exceptions.RequestException:
        sys.exit(
            f"Could not reach the VOICEVOX engine at {args.engine}.\n"
            "Open the VOICEVOX desktop app first — it starts the engine automatically."
        )

    if args.list:
        for sp in speakers:
            styles = ", ".join(st["name"] for st in sp["styles"])
            print(f"{sp['name']}: {styles}")
        return

    if not MANIFEST.exists():
        sys.exit(f"{MANIFEST} not found. Run:  node scripts/build_audio_manifest.mjs")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    speaker_id, name, style = resolve_speaker(speakers, args.speaker, args.style)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Voice: {name} ({style}), id {speaker_id}, speed {args.speed}")
    print(f"Output: {OUTPUT_DIR}")

    total = len(manifest)
    rendered = skipped = failed = 0

    for i, item in enumerate(manifest, 1):
        target = OUTPUT_DIR / f"{item['id']}.wav"
        if target.exists() and not args.force:
            skipped += 1
            continue

        print(f"[{i}/{total}] {item['id']}  {item['text']}")
        try:
            target.write_bytes(synthesize(args.engine, item["text"], speaker_id, args.speed))
            rendered += 1
        except requests.exceptions.RequestException as exc:
            print(f"    failed: {exc}", file=sys.stderr)
            failed += 1
        time.sleep(0.03)

    print(f"\nDone. {rendered} rendered, {skipped} already present, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
