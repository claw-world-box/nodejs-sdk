# agw-game-sdk

本包源码维护在独立仓库 **[nodejs-sdk](https://github.com/claw-world-box/nodejs-sdk)**（npm 包名仍为 `agw-game-sdk`）。若你在 `agw` 主仓库的旧文档里看到 `agw/agw-game-sdk/`，请改指向本仓库。

`agw-game-sdk` is a pure JavaScript AGW client SDK for game developers. It is meant for connecting a game client to the chain, reading game state, submitting actions, and optionally letting a strong LLM play through a simple autoplay loop.

This package intentionally does not include the old Rust/WASM pipeline, multi-stage decision stack, memory system, or small-model orchestration logic. It focuses on direct client integration.

## Agent integration (third-party LLM / autonomous agents)

Step-by-step action vocabulary, payloads, control loop, and LLM JSON vs tools mode are documented in **[AGENT_INTEGRATION.md](./AGENT_INTEGRATION.md)** (Chinese). Point external teams (e.g. Claude tool-use, custom Claw-style orchestrators) at that file plus `agw-game-sdk/rules` for prompt text.

## What It Includes

- Browser-friendly AGW chain client
- Substrate-first read/write game APIs
- Optional EVM precompile write path
- **Optional** read-only **pallet-relations** via precompile `0x504`：`getStanding` / `getRelation` / `getGlobalReputation`, and `readWorld(..., { includeRelations: true })` (requires `evmRpcUrl`; does not change `allowedActions`)
- **Epoch read**: `getEpoch()` uses Substrate storage; **`epoch.beaconPool` / `epoch.epochTreasury`** 是纪元金库余额（wei 字符串），**不是** Beacon 熵记分。熵需在有 `evmRpcUrl` 时调用 **`getBeaconEntropy()`**（`PRECOMPILE_EPOCH` 只读调用，返回 **`bigint` wei**，完整 `uint256`、不做 i32 截断）
- Built-in rules bundle for strong LLMs
- Simple autoplay demo for OpenAI-compatible chat models

## Install

```bash
git clone https://github.com/claw-world-box/nodejs-sdk.git
cd nodejs-sdk
npm install
```

发布到 npm 后也可：`npm install agw-game-sdk`。

## Minimal Use

```js
import { AgwGameClient } from "agw-game-sdk";

const client = new AgwGameClient({
  connectionMode: "smoldot",
  smoldotChainSpec: "<chain spec json text>",
  signerUri: "//Alice"
});

await client.connect();
const registered = await client.registerWithRandomSpawn();
const me = await client.getAgent(registered.agentId);
const cells = await client.watchSurroundings(2, { agentId: me.id });
console.log({ me, cells });
```

## LLM Demo

By default the agent uses **OpenAI-style tool calling**: the model is given tools for all SDK actions (move, harvest, attack, heal, transfer, broadcast, scout, build, etc.) and read APIs (read_world, get_agent, watch_surroundings). The SDK executes tool calls and can run multiple rounds per tick (e.g. read_world then move). Set `useTools: false` in options to fall back to the legacy JSON-only mode. Default `maxToolRounds` is `2`.

The demo feeds the model:

- built-in AGW rules
- live world snapshot
- tools for every SDK action and read API (or allowed action list in JSON mode)
- previous step result

Run it like this:

```bash
AGW_SMOLDOT_CHAIN_SPEC_PATH=/path/to/spec.json \
AGW_SIGNER_URI=//Alice \
OPENAI_BASE_URL=http://127.0.0.1:1234/v1 \
OPENAI_MODEL=gpt-4.1 \
node ./bin/agw-llm-demo.js
```

## Exports

Main entry:

- `AgwGameClient`
- `createAgwClient`
- `PROMPT_FSM_DEFAULTS`
- `submitAction`
- `readWorld`
- `enableRegistrationWhitelist`
- `addWhitelistBatch`
- `removeWhitelistBatch`
- `addWhitelistInChunks`
- `PRECOMPILE_WORLD`
- `PRECOMPILE_ACTION`
- `PRECOMPILE_EPOCH`
- `PRECOMPILE_ADMIN`（`0x503`）
- `PRECOMPILE_RELATIONS`（`0x504`，relations 只读）
- `DIRECTIONS`
- `STRUCTURE_KINDS`

Rules entry:

- `GAME_RULES_TEXT`
- `GAME_RULES_SECTIONS`
- `buildRulesPrompt`

Eval entry (`agw-game-sdk/eval` — model output checks / SFT):

- `evaluateModelOutput`, `extractActionCandidate`, `collectFailureSamples`

LLM entry (`agw-game-sdk/llm`):

- `runAutoplayLoop` — default `useTools: true` (tool calling)
- `runAutoplayLoop` hooks:
  - `contextBuilder({ iteration, snapshot, recentResult, allowedActions })`
  - `onDecisionInput({ iteration, useTools, decisionInput, metrics })`
  - `initialRecentResult` / `onRecentResult`
- `requestOpenAiCompatibleDecisionWithTools` — one request + tool loop
- `requestOpenAiCompatibleDecision` — JSON-only (no tools)
- `buildAutoplayPrompt`, `parseModelAction`
- `buildCompactPrompt`, `sanitizeModelOutput`
- `AGW_TOOLS`, `executeTool` — tool definitions and executor for custom flows

Standalone Gateway HTTP (`agw-game-sdk/standalone-gateway` — not in main entry; use explicit subpath import):

- `StandaloneGatewayClient` — `ethKeygen()` / `evmJsonRpc()` against **agw-standalone-api** (`POST /v1/crypto/eth-keygen`, `POST /v1/chain/evm/jsonrpc`). Requires loopback to the gateway; see **[AGENT_INTEGRATION.md](./AGENT_INTEGRATION.md)** §1.1.

## Registration Whitelist (Admin)

Early launch can be gated by on-chain whitelist for `register_agent`.

```js
import {
  AgwGameClient,
  enableRegistrationWhitelist,
  addWhitelistInChunks
} from "agw-game-sdk";

const client = new AgwGameClient({
  connectionMode: "ws",
  wsUrl: "ws://127.0.0.1:9944",
  signerUri: "//Alice" // sudo key on local/dev chain
});

await client.connect();
await enableRegistrationWhitelist(client, true); // sudo.sudo(agent.setRegistrationWhitelistEnabled(true))
await addWhitelistInChunks(client, ["0x1234...", "0xabcd..."], 500);
await client.disconnect();
```

CLI bulk import:

```bash
AGW_CONNECTION_MODE=ws \
SUBSTRATE_WS_URL=ws://127.0.0.1:9944 \
AGW_SIGNER_URI=//Alice \
node ./bin/agw-whitelist-admin.js add --file ./addresses.txt --chunk-size 500

node ./bin/agw-whitelist-admin.js enable
```

`addresses.txt` supports one address per line (lines starting with `#` are ignored) or a JSON array file.

## Snapshot `allowedActions` vs gateway

`readWorld().allowedActions` is derived from a **static FSM table** (`getAllowedActions`) aligned with the prompt-layer FSM in **rust-api-client** `game_prompt_align`, not from chain rules. It does **not** include dynamic extras that **agw-standalone-api** adds to `fsm_allowed_actions` (e.g. structure funding at certain balances). If you use the HTTP gateway, treat **`fsm_allowed_actions`** and **`POST /v1/actions/validate`** as authoritative for what may be submitted.

## Dependency upgrades

Behavior fixes and dependency version bumps are intentionally separate: upgrade `@polkadot/*`, `smoldot`, or `ethers` only on a branch where `npm test` is green, and in small cohorts (transport stack first, then ethers).

## Notes

- The SDK is browser-oriented, but the demo runs in Node.
- `getCell()` works in lazy-world mode by deriving deterministic cells from on-chain seed when storage is empty.
- The first version prefers chain-safe, simple behavior over complex autonomy infrastructure.
