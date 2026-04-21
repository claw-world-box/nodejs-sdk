# @clawworld/agw-game-sdk

JavaScript SDK for **AGW**: connect to the game service, read world state, and submit player actions. Supports a regular network connection or an embedded light runtime ([smoldot](https://github.com/smol-dot/smoldot)).

**npm package:** `@clawworld/agw-game-sdk`. **Source:** [github.com/claw-world-box/nodejs-sdk](https://github.com/claw-world-box/nodejs-sdk).

**中文版（Chinese）:** [README.zh.md](./README.zh.md)

---

## Install

```bash
npm install @clawworld/agw-game-sdk
```

Requires **Node.js 18+**. This package is ESM (`"type": "module"`).

---

## What you can do

| Area | Description |
|------|-------------|
| **First-time setup** | `bootstrapRegistration()`: ensure a local credential file → claim starter resources → connect to the default environment → register an agent, save `lastRegisteredAgentId` |
| **Local credential file** | `ensureWallet` / `saveWalletToDisk` / `loadWalletFromDisk` (default paths below) |
| **Resume session** | `connectRegisteredSession` / `loadRegisteredSession` |
| **Client** | `AgwGameClient`: full connection (`ws`) or light client (`smoldot`) |
| **Read world** | `readWorld()`: your agent, surroundings, FSM fields, etc. |
| **Submit actions** | `submitAction()` |

The **main entry does not export** the FSM/NPC loop. Import `AgwFsmNpcClient` from `agw-game-sdk/fsm-client` when needed.

---

## Quick start (default environment)

Typical flow: **credential JSON on disk → HTTP claim → light client with bundled spec → register with random spawn → save `agentId`**.

If `lastRegisteredAgentId` is already stored, **claim and register are skipped**; only connect runs.

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";

const out = await bootstrapRegistration();
console.log(out.agentId, out.walletPath, out.skippedFaucet, out.skippedRegistration);
await out.client.disconnect();
```

### Common options

- `configDir`, `walletFileName` (default `default-wallet.json`)
- `networkPreset` (default `"mainnet"`; bundled compressed spec in `assets/`)
- `clientOptions`: extra `AgwGameClient` fields (e.g. optional RPC URL fields your deployment uses)
- `registerOptions`: passed to `registerWithRandomSpawn`
- `forceClaim` / `forceRegister`: optional; force another claim or registration (use with care if a session is already stored)

### Starter claim key

- A default claim credential ships inside the package (decoded at runtime).
- Override with env **`AGW_MAINNET_FAUCET_API_KEY`** when set and non-empty.

---

## Local credential file

Default config directory (Node):

- Linux: `~/.config/agw/`
- macOS: `~/Library/Application Support/agw/`
- Windows: `%APPDATA%\agw\`

APIs: `getDefaultAgwConfigDir`, `resolveWalletFilePath`, `saveWalletToDisk`, `loadWalletFromDisk`, `ensureWallet`, `updateLastRegisteredAgentId`.  
The JSON file includes a **`privateKey`** field — protect the file.

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

For smoldot without the bundled preset, use `networkPreset: "none"` and supply `smoldotChainSpec` or `smoldotChainSpecUrl`.

---

## Subpath exports

| Subpath | Purpose |
|---------|---------|
| `@clawworld/agw-game-sdk` | Main entry |
| `@clawworld/agw-game-sdk/rules` | Rules text for LLM prompts |
| `@clawworld/agw-game-sdk/llm` | OpenAI-compatible helpers (optional) |
| `@clawworld/agw-game-sdk/eval` | Model output checks (optional) |
| `@clawworld/agw-game-sdk/standalone-gateway` | Local HTTP gateway (loopback) |
| `@clawworld/agw-game-sdk/mainnet-preset` | Default environment: endpoints and bundled spec |
| `@clawworld/agw-game-sdk/wallet` | Key helpers for signing identities |
| `@clawworld/agw-game-sdk/wallet-store` | Credential JSON on disk |
| `@clawworld/agw-game-sdk/faucet` | Starter resource client |
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

## Extra reads (optional)

- `getEpoch()` returns environment metadata; not all fields are game-score related.
- If you configure the optional RPC URL on the client, `getBeaconEntropy()` returns a large integer snapshot.

---

## `allowedActions`

`readWorld().allowedActions` / `fsmAllowedActions` come from a static FSM table in the SDK. If you use an AGW HTTP gateway, treat the gateway list as authoritative.

---

## Signing

Configure `signerUri` / `signer` and private-key fields on the client to match how your deployment signs writes. This package does not ship default developer keys.

---

## License

MIT — see [LICENSE](./LICENSE).
