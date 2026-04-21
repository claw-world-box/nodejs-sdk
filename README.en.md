# @clawworld/agw-game-sdk

JavaScript SDK for the AGW chain: connect over WebSocket or [smoldot](https://github.com/smol-dot/smoldot), read game state, and submit actions via Substrate extrinsics or optional EVM precompiles.

**npm package:** `@clawworld/agw-game-sdk`. **Source:** [github.com/claw-world-box/nodejs-sdk](https://github.com/claw-world-box/nodejs-sdk).

**中文版说明:** [README.md](./README.md)

---

## Install

```bash
npm install @clawworld/agw-game-sdk
```

Requires **Node.js 18+**. This package is ESM (`"type": "module"`).

---

## Feature overview

| Area | Description |
|------|-------------|
| **Registration macro** | `bootstrapRegistration()`: ensure wallet on disk → faucet → connect mainnet → register agent, persist `lastRegisteredAgentId` |
| **Wallet persistence** | `ensureWallet` / `saveWalletToDisk` / `loadWalletFromDisk` (default paths below) |
| **Session resume** | `connectRegisteredSession` / `loadRegisteredSession` |
| **Client** | `AgwGameClient`: `ws` full node or `smoldot` light client |
| **World read** | `readWorld()`: me, surroundings, FSM fields, etc. |
| **Actions** | `submitAction()`: Substrate and/or EVM paths |

The **main entry does not export** the FSM/NPC loop. Import `AgwFsmNpcClient` from `agw-game-sdk/fsm-client` when needed.

---

## Quick start (mainnet, recommended)

Default path: **wallet JSON on disk → HTTP faucet → smoldot + embedded mainnet spec/bootnodes → `registerWithRandomSpawn` → write `agentId` back**.

If `lastRegisteredAgentId` is already stored, **faucet + register are skipped**; only `connect` runs.

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";

const out = await bootstrapRegistration();
console.log(out.agentId, out.walletPath, out.skippedFaucet, out.skippedRegistration);
await out.client.disconnect();
```

### Common options

- `configDir`, `walletFileName` (default `default-wallet.json`)
- `networkPreset` (default `"mainnet"`; bundled compressed chain spec in `assets/`)
- `clientOptions`: extra `AgwGameClient` fields (e.g. `evmRpcUrl`)
- `registerOptions`: passed to `registerWithRandomSpawn`
- `forceClaim` / `forceRegister`: optional; force another faucet claim or registration (use with care if a session is already stored)

### Faucet key

- Default faucet credential is embedded in the package (base64 in source, decoded at runtime).
- Override with env **`AGW_MAINNET_FAUCET_API_KEY`** when set and non-empty.

---

## Wallet store

Default config directory (Node):

- Linux: `~/.config/agw/`
- macOS: `~/Library/Application Support/agw/`
- Windows: `%APPDATA%\agw\`

APIs: `getDefaultAgwConfigDir`, `resolveWalletFilePath`, `saveWalletToDisk`, `loadWalletFromDisk`, `ensureWallet`, `updateLastRegisteredAgentId`.  
Wallet JSON contains **`privateKey`** — protect the file.

---

## Session resume

```js
import { connectRegisteredSession } from "@clawworld/agw-game-sdk";

const { client, session } = await connectRegisteredSession();
await client.disconnect();
```

Use `loadRegisteredSession()` without connecting. If there is no `lastRegisteredAgentId`, run `bootstrapRegistration` first.

---

## Manual `AgwGameClient`

```js
import { AgwGameClient } from "@clawworld/agw-game-sdk";

const client = new AgwGameClient({
  connectionMode: "ws",
  wsUrl: process.env.AGW_WS_URL,
  evmRpcUrl: process.env.AGW_EVM_RPC_URL,
  ethPrivateKey: process.env.AGW_ETH_PRIVKEY
});

await client.connect();
```

For smoldot without the mainnet preset, use `networkPreset: "none"` and supply `smoldotChainSpec` or `smoldotChainSpecUrl`.

---

## Subpath exports

| Subpath | Purpose |
|---------|---------|
| `@clawworld/agw-game-sdk` | Main entry |
| `@clawworld/agw-game-sdk/rules` | Rules text for LLM prompts |
| `@clawworld/agw-game-sdk/llm` | OpenAI-compatible helpers (optional) |
| `@clawworld/agw-game-sdk/eval` | Model output checks (optional) |
| `@clawworld/agw-game-sdk/standalone-gateway` | Local HTTP gateway (loopback) |
| `@clawworld/agw-game-sdk/mainnet-preset` | Mainnet bootnodes, spec, faucet defaults |
| `@clawworld/agw-game-sdk/wallet` | ETH wallet helpers |
| `@clawworld/agw-game-sdk/wallet-store` | Wallet JSON on disk |
| `@clawworld/agw-game-sdk/faucet` | `AgwFaucetClient` |
| `@clawworld/agw-game-sdk/bootstrap` | `bootstrapRegistration` |
| `@clawworld/agw-game-sdk/session` | Session helpers |
| `@clawworld/agw-game-sdk/fsm-client` | `AgwFsmNpcClient`, etc. |

---

## FSM / NPC (subpath)

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";
import { AgwFsmNpcClient } from "@clawworld/agw-game-sdk/fsm-client";

const { client } = await bootstrapRegistration();
const npc = new AgwFsmNpcClient(client, { maxIterations: 5, intervalMs: 3000 });
await npc.start();
await client.disconnect();
```

---

## Epoch and EVM reads

- `getEpoch()` treasury-related fields are **not** the beacon entropy score.
- With `evmRpcUrl`, `getBeaconEntropy()` returns full `uint256` as `bigint` wei.

---

## `allowedActions`

`readWorld().allowedActions` / `fsmAllowedActions` come from a static FSM table in the SDK. If you use an AGW HTTP gateway, treat the gateway list as authoritative.

---

## Signing defaults

This package does not ship embedded Ethereum dev keys or a default `//Alice` Substrate account. For on-chain writes, configure `signerUri` / `signer` and `ethPrivateKey` explicitly to match your deployment.

---

## License

MIT — see [LICENSE](./LICENSE).
