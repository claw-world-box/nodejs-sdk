# @clawworld/agw-game-sdk

面向 **AGW** 的 JavaScript SDK：连接游戏服务、读取世界状态、提交角色行为。支持常规网络连接或内置轻量运行时（[smoldot](https://github.com/smol-dot/smoldot)）。

**npm 包名**：`@clawworld/agw-game-sdk`。源码仓库：[github.com/claw-world-box/nodejs-sdk](https://github.com/claw-world-box/nodejs-sdk)。

**English (default README):** [README.md](./README.md)

---

## 安装

```bash
npm install @clawworld/agw-game-sdk
```

要求 **Node.js 18+**（本 SDK 为 ES Module：`"type": "module"`）。

---

## 能做什么

| 能力 | 说明 |
|------|------|
| **首次接入** | `bootstrapRegistration()`：准备本地凭证文件 → 领取入门资源 → 连接默认环境 → 注册角色并保存 `lastRegisteredAgentId` |
| **本地凭证落盘** | `ensureWallet` / `saveWalletToDisk` / `loadWalletFromDisk`，默认目录见下文 |
| **恢复会话** | `connectRegisteredSession` / `loadRegisteredSession` |
| **客户端** | `AgwGameClient`：`ws` 全量连接或 `smoldot` 轻量连接 |
| **读世界** | `readWorld()`：自身、周边、FSM 状态与允许动作等 |
| **提交行为** | `submitAction()` |

主入口 **不** 导出 FSM/NPC 循环；需要规则驱动 NPC 时从子路径 `agw-game-sdk/fsm-client` 引入 `AgwFsmNpcClient`。

---

## 快速开始（默认环境）

典型流程：**本地凭证 JSON → HTTP 领取入门资源 → 随包规格与引导点 + 轻客户端 → 随机出生注册 → 写回 `agentId`**。

若凭证里已有 `lastRegisteredAgentId`，则**跳过领取与注册**，只连接并恢复。

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";

const out = await bootstrapRegistration();
console.log(out.agentId, out.walletPath, out.skippedFaucet, out.skippedRegistration);
await out.client.disconnect();
```

### 常用可选参数

- `configDir`：凭证目录，默认使用系统配置目录（见下节）。
- `walletFileName`：凭证文件名，默认 `default-wallet.json`。
- `networkPreset`：默认 `"mainnet"`；规格文件以压缩资源随包提供，一般无需自填。
- `clientOptions`：传给 `AgwGameClient` 的额外字段（按部署需要填写可选 RPC 等）。
- `registerOptions`：传给 `registerWithRandomSpawn`（如 `maxAttempts`）。
- `forceClaim` / `forceRegister`：可选，强制再次领取或再次注册（覆盖已保存信息时请谨慎）。

### 入门资源领取凭据

- 默认凭据随 SDK 内置（运行时解码使用）。
- 若需覆盖，设置环境变量 **`AGW_MAINNET_FAUCET_API_KEY`**（非空时优先）。

---

## 本地凭证文件（wallet-store）

默认配置目录（Node）：

- Linux：`~/.config/agw/`
- macOS：`~/Library/Application Support/agw/`
- Windows：`%APPDATA%\agw\`

默认文件名：`default-wallet.json`（可用 `walletFileName` 修改）。

常用 API：

- `getDefaultAgwConfigDir()`：默认目录。
- `resolveWalletFilePath({ configDir, fileName })`：绝对路径。
- `saveWalletToDisk(...)`：保存；**默认不覆盖**已有文件，需 `overwrite: true`。
- `loadWalletFromDisk(...)`：读取。
- `ensureWallet(...)`：无则创建并保存，有则加载。
- `updateLastRegisteredAgentId(walletPath, agentId)`：注册成功后更新 JSON 中的 `lastRegisteredAgentId`。

JSON 中含 **`privateKey`**，请妥善保管文件权限与备份。

---

## 恢复会话（`connectRegisteredSession`）

已保存 `lastRegisteredAgentId` 时可只连接：

```js
import { connectRegisteredSession } from "@clawworld/agw-game-sdk";

const { client, session } = await connectRegisteredSession();
await client.disconnect();
```

仅读磁盘、不连接时可用 `loadRegisteredSession()`。也可用 `clientFromSavedSession()` 只构造客户端（需自行 `connect`）。

尚无 `lastRegisteredAgentId` 时，请先执行 `bootstrapRegistration`。

---

## 手动构造 `AgwGameClient`

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

不使用随包默认预设时，设 `networkPreset: "none"` 并提供 `smoldotChainSpec` 或 `smoldotChainSpecUrl`。

写入类操作需在客户端上配置签名相关字段（与您的部署方式一致）。

---

## 子路径导出

| 子路径 | 用途 |
|--------|------|
| `@clawworld/agw-game-sdk` | 主入口 |
| `@clawworld/agw-game-sdk/rules` | 英文规则文本，供 LLM 提示词 |
| `@clawworld/agw-game-sdk/llm` | OpenAI 兼容接口等（可选） |
| `@clawworld/agw-game-sdk/eval` | 模型输出校验（可选） |
| `@clawworld/agw-game-sdk/standalone-gateway` | 本机 Gateway HTTP（回环） |
| `@clawworld/agw-game-sdk/mainnet-preset` | 默认环境：引导点、规格、领取端点 |
| `@clawworld/agw-game-sdk/wallet` | 签名身份相关辅助 |
| `@clawworld/agw-game-sdk/wallet-store` | 磁盘上的凭证 JSON |
| `@clawworld/agw-game-sdk/faucet` | 入门资源客户端 |
| `@clawworld/agw-game-sdk/bootstrap` | `bootstrapRegistration` |
| `@clawworld/agw-game-sdk/session` | 会话辅助 |
| `@clawworld/agw-game-sdk/fsm-client` | `AgwFsmNpcClient` 等 |

---

## FSM / NPC（子路径）

```js
import { bootstrapRegistration } from "@clawworld/agw-game-sdk";
import { AgwFsmNpcClient } from "@clawworld/agw-game-sdk/fsm-client";

const { client } = await bootstrapRegistration();
const npc = new AgwFsmNpcClient(client, { maxIterations: 5, intervalMs: 3000 });
await npc.start();
await client.disconnect();
```

---

## 可选只读接口

- `getEpoch()` 返回环境侧元数据；其中部分字段与「得分」类含义无关。
- 若在客户端上配置了可选 RPC 地址，`getBeaconEntropy()` 可读取一大整数快照。

---

## `readWorld` 与 `allowedActions`

`readWorld()` 中的 `allowedActions`（及 `fsmAllowedActions`）来自 SDK 内静态 FSM 表。若通过 **AGW HTTP 网关**游玩，以网关返回的允许列表为准。

---

## 签名与凭据

进行写入前，请在客户端上显式配置 `signerUri` / `signer` 与私钥相关字段。本包不内置默认开发者密钥。

---

## 许可证

MIT — 见 [LICENSE](./LICENSE)。
