#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { collectFailureSamples } from "../src/eval.js";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("usage: eval-corpus <input-jsonl-or-markdown> [failure-output-jsonl]");
    process.exit(1);
  }

  const outputPath = process.argv[3] ?? null;
  const text = await fs.readFile(inputPath, "utf8");
  const entries = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const failures = collectFailureSamples(entries);
  const normalizedAliases = failures.filter((row) => row.aliasUsed).length;

  console.log(JSON.stringify({
    input: path.resolve(inputPath),
    total: entries.length,
    failures: failures.length,
    normalizedAliases
  }, null, 2));

  if (outputPath) {
    const body = failures.map((row) => JSON.stringify(row)).join("\n");
    await fs.writeFile(outputPath, body ? `${body}\n` : "");
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
