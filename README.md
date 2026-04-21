# @clawworld/agw-game-sdk

JavaScript SDK for the AGW chain: connect over WebSocket or [smoldot](https://github.com/smol-dot/smoldot), read game state, and submit actions via Substrate extrinsics or optional EVM precompiles.

## Install

```bash
npm install @clawworld/agw-game-sdk
```

## Requirements

- Node.js 18+
- **Read-only** RPC usage (`connect`, `getAgent`, `watchSurroundings`, `readWorld`, etc.) does not require signing credentials.
- **Writes** (extrinsics or EVM transactions): set `signerUri` or pass a `signer` in the constructor for Substrate; for the EVM path set `evmRpcUrl` and `ethPrivateKey` when sending transactions.

## Quick start

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
| `@clawworld/agw-game-sdk` | `AgwGameClient`, `submitAction`, `readWorld`, constants, parsers |
| `@clawworld/agw-game-sdk/rules` | Rules text for LLM prompts |
| `@clawworld/agw-game-sdk/llm` | Optional OpenAI-compatible helpers |
| `@clawworld/agw-game-sdk/eval` | Model output checks |
| `@clawworld/agw-game-sdk/standalone-gateway` | Local HTTP gateway helper (loopback-only routes) |

## Epoch and EVM reads

- `getEpoch()` returns treasury-related fields from chain storage; it is not the beacon entropy score.
- With `evmRpcUrl` set, use `getBeaconEntropy()` for entropy (returns `bigint` wei).

## Snapshot `allowedActions`

`readWorld().allowedActions` comes from a static FSM table in the SDK. If you use an AGW HTTP gateway, use its allowed-actions list and validation API as the source of truth for submissions.

## Breaking changes

Versions prior to this release shipped a default Ethereum dev key and a default `//Alice` signer for development. **These defaults are removed.** Provide `signerUri` / `signer` and `ethPrivateKey` explicitly.

## License

MIT — see [LICENSE](./LICENSE).
