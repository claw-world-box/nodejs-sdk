#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { AgwGameClient, addWhitelistInChunks, enableRegistrationWhitelist, removeWhitelistBatch } from "../src/index.js";
import { clampPositiveInt } from "../src/utils.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chainSpec = await resolveChainSpec();
  const client = new AgwGameClient({
    connectionMode: process.env.AGW_CONNECTION_MODE ?? (chainSpec ? "smoldot" : "ws"),
    wsUrl: process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
    smoldotChainSpec: chainSpec,
    smoldotChainSpecUrl: process.env.AGW_SMOLDOT_CHAIN_SPEC_URL ?? null,
    smoldotBootnodes: process.env.AGW_SMOLDOT_BOOTNODES ?? process.env.AGW_SMOLDOT_BOOTNODE ?? "",
    signerUri: process.env.AGW_SIGNER_URI ?? null,
    ethPrivateKey: process.env.AGW_ETH_PRIVKEY ?? null
  });
  await client.connect();
  try {
    await runCommand(client, args);
  } finally {
    await client.disconnect();
  }
}

async function runCommand(client, args) {
  if (args.command === "enable" || args.command === "disable") {
    const enabled = args.command === "enable";
    await enableRegistrationWhitelist(client, enabled, { useSudo: !args.noSudo });
    console.log(`whitelist enabled=${enabled}`);
    return;
  }

  const addresses = await loadAddresses(args.filePath);
  if (args.command === "add") {
    const chunkSize = clampPositiveInt(args.chunkSize ?? client.api.consts?.agent?.maxWhitelistBatch?.toNumber?.() ?? 1000, 1000);
    const result = await addWhitelistInChunks(client, addresses, chunkSize, { useSudo: !args.noSudo });
    console.log(
      JSON.stringify(
        {
          action: "add",
          totalAddresses: result.totalAddresses,
          chunkSize: result.chunkSize,
          chunks: result.chunks
        },
        null,
        2
      )
    );
    return;
  }

  if (args.command === "remove") {
    const chunkSize = clampPositiveInt(args.chunkSize ?? client.api.consts?.agent?.maxWhitelistBatch?.toNumber?.() ?? 1000, 1000);
    let chunks = 0;
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);
      await removeWhitelistBatch(client, chunk, { useSudo: !args.noSudo });
      chunks += 1;
    }
    console.log(JSON.stringify({ action: "remove", totalAddresses: addresses.length, chunkSize, chunks }, null, 2));
    return;
  }

  throw new Error(`unsupported command: ${args.command}`);
}

async function resolveChainSpec() {
  const inline = String(process.env.AGW_SMOLDOT_CHAIN_SPEC ?? "").trim();
  if (inline) return inline;
  const path = String(process.env.AGW_SMOLDOT_CHAIN_SPEC_PATH ?? "").trim();
  if (!path) return null;
  return (await readFile(path, "utf8")).trim();
}

function parseArgs(argv) {
  const command = String(argv[0] ?? "add").trim().toLowerCase();
  if (!["add", "remove", "enable", "disable"].includes(command)) {
    throw new Error("usage: agw-whitelist-admin <add|remove|enable|disable> [--file path] [--chunk-size n] [--no-sudo]");
  }

  const out = { command, filePath: "", chunkSize: undefined, noSudo: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-sudo") {
      out.noSudo = true;
      continue;
    }
    if (arg === "--file") {
      out.filePath = String(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--chunk-size") {
      out.chunkSize = Number(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
  }
  if ((command === "add" || command === "remove") && !out.filePath) {
    throw new Error("--file is required for add/remove");
  }
  return out;
}

async function loadAddresses(filePath) {
  const text = await readFile(filePath, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("json whitelist file must be an array");
    }
    return parsed.map((value) => String(value ?? "").trim()).filter(Boolean);
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
