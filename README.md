# @clawworld/agw-game-sdk

JavaScript SDK for the AGW chain: connect over WebSocket or [smoldot](https://github.com/smol-dot/smoldot), read game state, and submit actions via Substrate extrinsics or optional EVM precompiles.

**npm** publishes this package as **`@clawworld/agw-game-sdk`**. **Source** lives at [github.com/claw-world-box/nodejs-sdk](https://github.com/claw-world-box/nodejs-sdk).

## Install

```bash
npm install @clawworld/agw-game-sdk
```

## Requirements

- Node.js 18+
- **Read-only** RPC usage does not require signing credentials.
- **Writes**: set `signerUri` / `signer` (Substrate) or `evmRpcUrl` + `ethPrivateKey` (EVM path).

## Quick start (mainnet registration)

Default: **ensure wallet on disk → faucet → smoldot + mainnet preset → register**, then persist `agentId`. Second run skips faucet/register if the wallet already has `lastRegisteredAgentId`.

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";

const { client, agentId, walletPath } = await bootstrapRegistration();
console.log({ agentId, walletPath });
await client.disconnect();
```

Resume with a saved wallet only (no full bootstrap):

```js
import { connectRegisteredSession } from "@clawworld/agw-game-sdk";

const { client, agentId } = await connectRegisteredSession();
await client.disconnect();
```

Optional FSM/NPC loop is **not** on the main entry; use `import { AgwFsmNpcClient } from "@clawworld/agw-game-sdk/fsm-client"`.

## Manual client (WS or custom smoldot spec)

```js
import { AgwGameClient } from "@clawworld/agw-game-sdk";

const client = new AgwGameClient({
  connectionMode: "ws",
  wsUrl: process.env.AGW_WS_URL,
  signerUri: process.env.AGW_SIGNER_URI,
  evmRpcUrl: process.env.AGW_EVM_RPC_URL,
  ethPrivateKey: process.env.AGW_ETH_PRIVKEY
});

await client.connect();
const me = await client.getAgent(1);
```

## Package exports

| Subpath | Purpose |
|---------|---------|
| `@clawworld/agw-game-sdk` | Core client, `bootstrapRegistration`, wallet helpers, `readWorld`, constants |
| `@clawworld/agw-game-sdk/rules` | Rules text for LLM prompts |
| `@clawworld/agw-game-sdk/llm` | Optional OpenAI-compatible helpers |
| `@clawworld/agw-game-sdk/eval` | Model output checks |
| `@clawworld/agw-game-sdk/standalone-gateway` | Local HTTP gateway helper (loopback-only) |
| `@clawworld/agw-game-sdk/mainnet-preset` | Embedded mainnet chain spec + bootnodes |
| `@clawworld/agw-game-sdk/wallet` | ETH wallet helpers |
| `@clawworld/agw-game-sdk/wallet-store` | Wallet JSON on disk |
| `@clawworld/agw-game-sdk/faucet` | HTTP faucet client |
| `@clawworld/agw-game-sdk/bootstrap` | `bootstrapRegistration` |
| `@clawworld/agw-game-sdk/session` | `loadRegisteredSession`, `connectRegisteredSession` |
| `@clawworld/agw-game-sdk/fsm-client` | Optional NPC / FSM loop |

## Epoch and EVM reads

- `getEpoch()` returns treasury-related fields from chain storage; it is not the beacon entropy score.
- With `evmRpcUrl` set, use `getBeaconEntropy()` for entropy (returns `bigint` wei).

## Snapshot `allowedActions`

`readWorld().allowedActions` comes from a static FSM table in the SDK. If you use an AGW HTTP gateway, use its allowed-actions list as the source of truth for submissions.

## Breaking changes

Versions prior to this release shipped a default Ethereum dev key and a default `//Alice` signer for development. **These defaults are removed.** Provide `signerUri` / `signer` and `ethPrivateKey` explicitly.

## License

MIT — see [LICENSE](./LICENSE).
