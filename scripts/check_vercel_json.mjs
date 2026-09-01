// Validates vercel.json before it can fail a deployment.
//
//   node scripts/check_vercel_json.mjs
//
// Written after a deploy failed with "Invalid vercel.json file provided" —
// an error Vercel raises before the build starts, so there are no build logs
// to read and nothing local had caught it. The file contained `\.` inside a
// regex, which is not a legal JSON escape, so it was not even parseable.
//
// Checks, cheapest first:
//   1. the file parses as JSON at all
//   2. every top-level key exists in Vercel's published schema
//   3. every rewrite/redirect/header entry has its required keys and no others
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "vercel.json");
const SCHEMA_URL = "https://openapi.vercel.sh/vercel.json";

const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
};
const pass = (msg) => console.log(`PASS  ${msg}`);

let raw;
try {
  raw = readFileSync(file, "utf8");
} catch {
  console.log("No vercel.json — nothing to check.");
  process.exit(0);
}

let config;
try {
  config = JSON.parse(raw);
  pass("vercel.json is valid JSON");
} catch (err) {
  fail(`vercel.json is not valid JSON — ${err.message}`);
  console.error("\n  A backslash in a regex must be doubled: \\\\. not \\.");
  process.exit(1);
}

let schema;
try {
  const res = await fetch(SCHEMA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  schema = await res.json();
  pass("fetched Vercel's published schema");
} catch (err) {
  // Offline is not a failure: the JSON parse above is the check that actually
  // caught the real bug, and it needs no network.
  console.log(`SKIP  could not fetch schema (${err.message}); JSON syntax was still checked`);
  process.exit(process.exitCode || 0);
}

const allowed = Object.keys(schema.properties || {});
for (const key of Object.keys(config)) {
  if (!allowed.includes(key)) fail(`unknown top-level key "${key}"`);
}
if (!process.exitCode) pass(`all top-level keys are recognised (${Object.keys(config).join(", ")})`);

for (const section of ["rewrites", "redirects", "headers"]) {
  const entries = config[section];
  if (!Array.isArray(entries)) continue;

  const itemSchema = schema.properties?.[section]?.items;
  const itemProps = Object.keys(itemSchema?.properties || {});
  const required = itemSchema?.required || [];

  entries.forEach((entry, i) => {
    for (const req of required) {
      if (!(req in entry)) fail(`${section}[${i}] is missing required key "${req}"`);
    }
    if (itemProps.length) {
      for (const key of Object.keys(entry)) {
        if (!itemProps.includes(key)) fail(`${section}[${i}] has unknown key "${key}"`);
      }
    }
  });

  if (!process.exitCode) pass(`${section}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} well formed`);
}

if (!process.exitCode) console.log("\nvercel.json looks deployable.");
