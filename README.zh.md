# @clawworld/agw-game-sdk

面向 AGW 链的 JavaScript SDK：支持 WebSocket 或 [smoldot](https://github.com/smol-dot/smoldot) 轻客户端连接、读取游戏状态、通过 Substrate 外部交易或可选 EVM 预编译提交动作。

**npm 包名**：`@clawworld/agw-game-sdk`。源码仓库：[github.com/claw-world-box/nodejs-sdk](https://github.com/claw-world-box/nodejs-sdk)。

**English (default README):** [README.md](./README.md)

---

## 安装

```bash
npm install @clawworld/agw-game-sdk
```

要求 **Node.js 18+**（本 SDK 为 ES Module：`"type": "module"`）。

---

## 能力概览

| 能力 | 说明 |
|------|------|
| **主网注册流程** | `bootstrapRegistration()`：生成/加载钱包 → 领水 → 连主网 → 注册 agent，并写回 `lastRegisteredAgentId` |
| **钱包落盘** | `ensureWallet` / `saveWalletToDisk` / `loadWalletFromDisk`，默认目录见下文 |
| **会话恢复** | `connectRegisteredSession` / `loadRegisteredSession`，复用已保存的钱包与 `agentId` |
| **链客户端** | `AgwGameClient`：`ws` 全节点 RPC 或 `smoldot` 轻客户端 |
| **读世界** | `readWorld()`：聚合自身、周边格子、FSM 状态与允许动作等 |
| **提交动作** | `submitAction()`：可按链能力选择 Substrate 或 EVM 路径 |

主入口 **不** 导出 FSM/NPC 循环；需要规则驱动 NPC 时从子路径 `agw-game-sdk/fsm-client` 引入 `AgwFsmNpcClient`。

---

## 主网注册（`bootstrapRegistration`，推荐）

默认流程：**确保钱包 JSON 落盘 → HTTP 领水 → smoldot + 内嵌主网 chain spec / bootnode → `registerWithRandomSpawn` → 将 `agentId` 写回钱包文件**。

若钱包文件中已有 `lastRegisteredAgentId`，则**跳过领水与注册**，仅连接并恢复会话。

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";

const out = await bootstrapRegistration();
console.log(out.agentId, out.walletPath, out.skippedFaucet, out.skippedRegistration);
await out.client.disconnect();
```

### 常用可选参数

- `configDir`：钱包目录，默认使用系统配置目录（见下节）。
- `walletFileName`：钱包文件名，默认 `default-wallet.json`。
- `networkPreset`：默认 `"mainnet"`；链规格以压缩资源随包提供，一般无需自填 spec。
- `clientOptions`：传给 `AgwGameClient` 的额外字段（例如自定义 `evmRpcUrl`）。
- `registerOptions`：传给 `registerWithRandomSpawn`（如 `maxAttempts`）。
- `forceClaim` / `forceRegister`：可选，强制再次领水或再次注册（覆盖已保存的会话信息时请谨慎使用）。

### 水龙头与密钥

- 默认领水凭据随 SDK 嵌入（源码内 base64 载荷，运行时解码），`AgwFaucetClient` 与 `bootstrapRegistration` 可直接使用。
- 若需覆盖，设置环境变量 **`AGW_MAINNET_FAUCET_API_KEY`**（非空时优先于文件）。

---

## 钱包持久化（wallet-store）

默认配置目录（Node）：

- Linux：`~/.config/agw/`
- macOS：`~/Library/Application Support/agw/`
- Windows：`%APPDATA%\agw\`

默认钱包文件：`default-wallet.json`（可用 `walletFileName` 修改）。

常用 API：

- `getDefaultAgwConfigDir()`：解析默认目录。
- `resolveWalletFilePath({ configDir, fileName })`：绝对路径。
- `saveWalletToDisk(wallet, { configDir, fileName, overwrite?, networkPreset?, lastRegisteredAgentId? })`：保存；**默认不覆盖**已有文件，需 `overwrite: true`。
- `loadWalletFromDisk(...)`：读取。
- `ensureWallet(...)`：无则创建并保存，有则加载。
- `updateLastRegisteredAgentId(walletPath, agentId)`：注册成功后更新 JSON 中的 `lastRegisteredAgentId`。

钱包 JSON 含 **`privateKey`**，请妥善保管文件权限与备份策略。

---

## 会话恢复（`connectRegisteredSession`）

已注册过（磁盘中有 `lastRegisteredAgentId`）时，可只连接：

```js
import { connectRegisteredSession } from "@clawworld/agw-game-sdk";

const { client, session } = await connectRegisteredSession();
// session.agentId、session.walletPath 等
await client.disconnect();
```

仅读取磁盘、不连链时可用 `loadRegisteredSession()`。也可用 `clientFromSavedSession()` 只构造客户端实例（需自行 `connect`）。

若钱包中尚无 `lastRegisteredAgentId`，`connectRegisteredSession` 会报错，需先执行 `bootstrapRegistration`。

---

## 手动构造 `AgwGameClient`（WebSocket 或自定义链）

不使用 `bootstrapRegistration` 时，可自行构造客户端。例如连接全节点 WebSocket：

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

使用 **smoldot** 且**非**主网预设时，设置 `networkPreset: "none"` 并提供 `smoldotChainSpec` 或 `smoldotChainSpecUrl`。

写入类操作需要：**Substrate** 侧 `signerUri` / `signer`，或 **EVM** 侧 `evmRpcUrl` + `ethPrivateKey`（与游戏注册方式一致）。

---

## 子路径导出（按需 `import`）

| 子路径 | 用途 |
|--------|------|
| `@clawworld/agw-game-sdk` | 主入口：客户端、注册宏、钱包、读世界、常量等 |
| `@clawworld/agw-game-sdk/rules` | 英文规则文本，供 LLM 提示词 |
| `@clawworld/agw-game-sdk/llm` | OpenAI 兼容接口、工具调用等（可选） |
| `@clawworld/agw-game-sdk/eval` | 模型输出校验（可选） |
| `@clawworld/agw-game-sdk/standalone-gateway` | 本机 Gateway HTTP（回环），与直连链分离 |
| `@clawworld/agw-game-sdk/mainnet-preset` | 主网 bootnode、chain spec 加载、faucet 默认配置 |
| `@clawworld/agw-game-sdk/wallet` | `createRandomEthWallet`、`walletFromPrivateKey` |
| `@clawworld/agw-game-sdk/wallet-store` | 磁盘钱包 JSON |
| `@clawworld/agw-game-sdk/faucet` | `AgwFaucetClient` |
| `@clawworld/agw-game-sdk/bootstrap` | `bootstrapRegistration` |
| `@clawworld/agw-game-sdk/session` | `loadRegisteredSession`、`connectRegisteredSession` |
| `@clawworld/agw-game-sdk/fsm-client` | `AgwFsmNpcClient` 等（NPC/FSM 循环） |

---

## FSM / NPC（子路径）

主入口不导出 `AgwFsmNpcClient`。基于 `readWorld` 的 `fsmAllowedActions` 做简单规则循环时：

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";
import { AgwFsmNpcClient } from "@clawworld/agw-game-sdk/fsm-client";

const { client } = await bootstrapRegistration();
const npc = new AgwFsmNpcClient(client, { maxIterations: 5, intervalMs: 3000 });
await npc.start();
await client.disconnect();
```

---

## Epoch 与 EVM 只读

- `getEpoch()`：来自链上存储的纪元信息；其中与金库相关的字段**不是** Beacon 熵分数。
- 若配置了 `evmRpcUrl`，可用 `getBeaconEntropy()` 读取熵（返回 `bigint` wei，完整 `uint256`）。

---

## `readWorld` 与 `allowedActions`

`readWorld()` 快照中的 `allowedActions`（及兼容字段 `fsmAllowedActions`）来自 SDK 内静态 FSM 表。若你通过 **AGW HTTP 网关** 游玩，以网关返回的允许动作列表与校验为准。

---

## 版本说明（签名与默认账户）

本包不再内置默认以太坊开发私钥或默认 `//Alice` Substrate 账户。进行链上写入时，请显式配置 `signerUri` / `signer` 与 `ethPrivateKey`（与所选注册与签名方式一致）。

---

## 许可证

MIT — 见 [LICENSE](./LICENSE)。
