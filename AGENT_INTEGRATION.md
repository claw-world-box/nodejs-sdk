# AGW Agent 集成指南（第三方 Autonomous Agent / LLM）

本文说明：**仅依赖 `agw-game-sdk`** 时，如何把「读状态 → 决策 → 提交动作」闭环接起来，并让外部 agent（如带工具调用的 Claude、自建脚本、Claw 类编排器）稳定、可评测地运行。

---

## 1. SDK 能帮你做什么

| 能力 | 入口 | 说明 |
|------|------|------|
| 连接链 | `AgwGameClient` / `createAgwClient` | `connectionMode`: `ws` 或 `smoldot`；需 RPC / chain spec、签名账户等 |
| 读世界快照 | `readWorld(client, input)` | 聚合 `me`、**`navigation`**（地图宽高、坐标轴与 `move` 增量、`legalDirections` 边界安全方向）、周边格、附近 agent、消息、遗迹、epoch、`allowedActions` 等；可选 `includeRelations: true` 时附加 **pallet-relations** 只读数据（需 EVM） |
| Relations 只读（链上 `0x504`） | `getStanding` / `getRelation` / `getGlobalReputation` | 与 `PRECOMPILE_RELATIONS` 对齐；**不**作为 `allowedActions` 或动作合法性的硬约束（与 `rules` 中 heal/transfer 等表述一致） |
| 提交动作 | `submitAction(client, { action, agentId, payload, path? })` | 自动选 EVM 预编译或 Substrate（`path: "evm" \| "substrate" \| "auto"`） |
| 动作名规范化 | `normalizeAction(name)` | 统一别名 → 规范 `snake_case` 动作名 |
| 默认允许动作全集 | `DEFAULT_ALLOWED_ACTIONS`（`constants.js` 导出） | 与链上能力对齐的「词汇表」 |
| 规则文本（给 LLM） | `import { GAME_RULES_TEXT, buildRulesPrompt } from "agw-game-sdk/rules"` | 英文规则 + 快照字段说明 |
| JSON 决策解析 | `import { parseModelAction, sanitizeModelOutput, buildCompactPrompt, ... } from "agw-game-sdk/llm"` | 模型只输出 JSON 时的解析与回退 |
| 工具定义与执行 | `AGW_TOOLS`, `executeTool`（`agw-game-sdk/llm`） | OpenAI 兼容 tool-calling 流程 |
| 评测抽取（语料/SFT） | `import { evaluateModelOutput, extractActionCandidate } from "agw-game-sdk/eval"` | 从自由文本里抽 action 并校验是否在允许列表内 |

**结论：** 工程上 agent **只需要 SDK** 即可完成链上游玩闭环；**玩法与策略**请结合 `rules` 与本文档中的 payload 约定。

---

## 2. 连接所需配置（安装 SDK 后必须向对方交代清楚）

对方 agent / 宿主进程在创建 `AgwGameClient`（或等价封装）时，需要以下几类信息。**缺任何一类在对应模式下都会连不上或签不了交易。**

### 2.1 连接方式（二选一）

| 模式 | `connectionMode` | 必须提供的参数 | 典型场景 |
|------|------------------|----------------|----------|
| **WebSocket** | `"ws"` | `wsUrl`（Substrate RPC，如 `ws://主机:9944`） | 本地节点、远程全节点、你们提供的 wss 端点 |
| **Smoldot（轻客户端）** | `"smoldot"` | `smoldotChainSpec`（链 spec **JSON 字符串**）**或** `smoldotChainSpecUrl`（可拉取到同一份 JSON 的 URL） | 浏览器、不想依赖全节点 RPC 时 |

说明：

- 若构造时**显式传了** `wsUrl` 且未写 `connectionMode`，SDK 会默认用 **`ws`**。
- 若未传 `wsUrl`，默认会走 **`smoldot`**，此时**必须**能解析出 chain spec（内联或 URL）。
- 可选：`smoldotBootnodes` / `AGW_SMOLDOT_BOOTNODES`（多 bootnode 用逗号等分隔，与你们运维约定一致）、`smoldotConfig`（高级）、`wsTimeoutMs`（WS 超时，默认 10000）。

### 2.2 签名身份（Substrate）

- **`signerUri`**：Sr25519 账户，常见为 `//Alice` 式开发 URI，或助记词/派生路径（与 `@polkadot/keyring` 一致）。
- 或传入 **`signer`** 对象（已由对方托管密钥时），可不使用 `signerUri`。

**必须告知对方：** 用于注册的账户地址是否已在链上 **注册白名单** 内（若你们开启了白名单，未加入则 `register` 会失败）。

### 2.3 EVM 预编译路径（若使用 `submitAction` 的 `path: "auto"` / `"evm"`）

- **`evmRpcUrl`**：兼容 **以太坊 JSON-RPC** 的端点（很多 Frontier 链上与 Substrate 共用同一 WS，SDK 默认会用 `wsUrl` 填这一项；若 ETH RPC 与 Substrate WS **不是同一个 URL**，必须单独给出 `evmRpcUrl`）。
- **`ethPrivateKey`**：用于发 EVM 交易的 **0x…** 私钥。生产环境必须由对方自备；SDK 内置默认值**仅便于本地 demo，切勿用于主网或共享环境。**

若对方强制只走 Substrate extrinsic，可在每次 `submitAction` 时传 **`path: "substrate"`**，对 `ethPrivateKey` 的依赖会降低（仍以 Substrate `signer` 为准）。

#### 2.3.1 pallet-relations 只读（可选）

- 链上通过 EVM 预编译 **`0x504`** 暴露：`getStanding(address,address)`、`getRelation(address,address)`、`getGlobalReputation(address)`（实现见 `agw-chain-game` 运行时 `precompiles.rs`）。
- SDK：`AgwGameClient` 提供同名方法，**必须先配置 `evmRpcUrl`**（与 `callContract` 读预编译一致）。
- **`readWorld(client, { ..., includeRelations: true })`**：在快照根上增加 `relations: { globalReputation, peers }`；其中 `peers` 为相对**邻近其他 agent**（不含自己）的 `standing` 与态度（`Neutral` / `Allied` / `Hostile`）。若未配置 EVM、或 `me.owner` 无法解析为 H160，则返回 `relations: null` 与 `relationsError` 说明原因，**不影响**其余快照字段。单个 peer 的 `getStanding`/`getRelation` 失败时，该条带 `error` 字符串，**其余 peer 与 `globalReputation` 仍保留**；仅 `getGlobalReputation` 整体失败时才会 `relations: null`。
- **默认不开启** `includeRelations`，避免每次快照额外增加多轮 EVM 只读 RPC。
- Agent `owner` 需为 **`0x` + 40 位 hex**（Frontier AccountId20）；否则该条 relations 数据会跳过或带 `error` 字段。

### 2.4 Agent 身份

- **`agentId`**：若角色已注册，直接传入已有 id。
- 若为 **新玩家**：连接成功后调用 `registerWithRandomSpawn()`（或你们文档中的其它注册流程），再把返回的 id 赋给 `client.agentId`。

### 2.5 建议一并告知的「对接参数表」（可复制发给对方）

| 给对方的信息项 | 示例 / 说明 |
|----------------|-------------|
| 连接模式 | `ws` 或 `smoldot` |
| Substrate RPC | `wss://...` 或 `ws://ip:9944` |
| Chain spec | 文件路径、内联 JSON、或下载 URL（仅 smoldot 必填） |
| Bootnodes | 可选，多节点用字符串列出 |
| 签名方式 | `signerUri` 格式说明，或说明由对方注入 `signer` |
| EVM RPC | 若与 WS 不同，单独写清 URL |
| EVM 私钥 | 由对方生成并保管；说明是否必须 |
| 注册与白名单 | 对方地址是否已加白名单、如何申请 |
| 已有 `agentId` | 有则直接给数字；无则说明注册步骤 |

### 2.6 与官方 `agw-llm-demo` 对齐的环境变量（便于对方用脚本验证）

若对方先跑通官方 demo，可对照设置：

| 环境变量 | 含义 |
|----------|------|
| `AGW_CONNECTION_MODE` | `ws` / `smoldot` |
| `SUBSTRATE_WS_URL` | WS RPC（`ws` 模式） |
| `AGW_EVM_RPC_URL` | EVM JSON-RPC，默认可跟 `SUBSTRATE_WS_URL` |
| `AGW_SMOLDOT_CHAIN_SPEC` | chain spec 全文（少用，体大） |
| `AGW_SMOLDOT_CHAIN_SPEC_PATH` | spec 文件路径 |
| `AGW_SMOLDOT_CHAIN_SPEC_URL` | 拉取 spec 的 URL |
| `AGW_SMOLDOT_BOOTNODES` | bootnodes 字符串 |
| `AGW_SIGNER_URI` | Substrate 签名 URI |
| `AGW_ETH_PRIVKEY` | EVM 私钥（hex） |
| `AGW_AGENT_ID` | 已有 agent 时指定 |

LLM 仅用于 demo 时还需：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 等（与链连接无关）。

---

## 3. 最小控制循环（伪代码）

```js
import { AgwGameClient, readWorld, submitAction } from "agw-game-sdk";

const client = new AgwGameClient({ /* connectionMode, wsUrl | smoldotChainSpec, signerUri, ... */ });
await client.connect();
// 若尚未注册：await client.registerWithRandomSpawn() 等，拿到 agentId 并设到 client

for (;;) {
  const snapshot = await readWorld(client, { radius: 2, agentId: client.agentId });
  const allowed = snapshot.allowedActions; // 本回合实际可调用子集，优先以它为准

  // === 你的 agent：根据 snapshot + allowed 产出 decision ===
  const decision = await yourAgentDecide({ snapshot, allowed });

  const { action, payload } = decision;
  const recentResult = await submitAction(client, {
    action,
    agentId: client.agentId,
    payload,
    path: "auto"
  });

  // 可把 recentResult 喂回下一轮 prompt
}
```

**要点：**

- 每一轮都以 `readWorld` 的 **`allowedActions`** 为硬约束；不要用 `DEFAULT_ALLOWED_ACTIONS` 替代运行时列表（除非你做离线评测且明确知道状态）。
- `submitAction` 已内置 `normalizeAction`；模型侧仍建议输出规范名，减少歧义。

### 3.1 坐标与东南西北（避免模型搞反）

链上约定：**North → y+1，South → y−1，East → x+1，West → x−1**；合法坐标 **`0 ≤ x < mapWidth`，`0 ≤ y < mapHeight`**。快照里的 **`navigation`** 提供 **`directionDeltas`**、文字 **`axisConvention`**，以及 **`legalDirections`**（仅保证不走出地图，不保证墙/地形可走）。规则包 **`GAME_RULES_TEXT`** 含章节 **Coordinates And Move Directions**。工具定义里 `move` / `scout` 的 description 也重复了边界语义。

---

## 4. 动作词汇表与 `payload` 约定

规范动作名（与 `DEFAULT_ALLOWED_ACTIONS` 一致）及典型 `payload`：

| `action` | `payload` 字段 | 说明 |
|----------|----------------|------|
| `move` | `{ direction }` | `direction`: `North` / `South` / `East` / `West`（或 `n/s/e/w`），内部映射为 `0–3` |
| `harvest` | `{}` | |
| `attack` | `{ targetId }` | 目标 agent id（数字） |
| `heal` | `{ targetId }` | 链上仅要求同格等硬条件，**不**要求双方已在 relations 中结盟；策略上仍可优先治队友。 |
| `transfer` | `{ targetId, amount, memo? }` | `memo` 可选，会编码为链上 bytes |
| `renew` | `{}` | |
| `broadcast` | `{ message }` 或 `{ content }` | 广播文本 |
| `scout` | `{ x, y }` | 侦察坐标 |
| `submit_heartbeat` | `{}` | |
| `build_wall` | `{}` | |
| `build` | `{ structureType }` 或 `{ kind }` | `Wall` / `Rampart` / `Road` / `Tower` / `Container`（大小写不敏感）或整数 `0–4` |
| `demolish` | `{}` | |
| `fund_structure` | `{ x, y, amount }` | 补缴并恢复维护 |
| `set_structure_maintenance` | `{ x, y, active }` | 手动停/开维护 |
| `siege_wall` | `{ x, y }` | 邻格攻城敌方墙 |
| `contribute_beacon` | `{ amount }` | epoch 相关 |
| `register_shelter` | `{ radius }` | |

**方向与建筑类型常量（编程引用）：**

- `DIRECTIONS`：`North=0, South=1, West=2, East=3`
- `STRUCTURE_KINDS`：`Wall, Rampart, Road, Tower, Container` 对应 `0–4`

**EVM 预编译地址（与链上 Frontier 一致）**：`PRECOMPILE_WORLD` / `ACTION` / `EPOCH`（`0x500`–`0x502`），以及 **`PRECOMPILE_ADMIN`（`0x503`）**、**`PRECOMPILE_RELATIONS`（`0x504`）** — 后两者供合约只读或管理查询；**`heal` 合法性不读 relations**。完整说明见仓库 **`docs/wiki/07-sdk-api-reference.md` §10** 与 **`docs/wiki/05-chain-and-runtime.md` §4**。

---

## 5. `normalizeAction` 接受的别名

便于模型或旧语料使用非规范名，最终会落到上表中的规范 `action`：

| 输入别名（示例） | 规范名 |
|------------------|--------|
| `submitHeartbeat`, `submitheartbeat` | `submit_heartbeat` |
| `buildWall`, `buildwall` | `build_wall` |
| `transfer_with_msg`, `transfer-msg` 等 | `transfer` |
| `probe`, `probe_target` | `scout` |
| `logic_shock` | `attack` |
| `atomic_swap` | `transfer` |
| `fundstructure` | `fund_structure` |
| `setstructuremaintenance` | `set_structure_maintenance` |
| `siegewall` | `siege_wall` |
| `contributebeacon` | `contribute_beacon` |
| `registershelter` | `register_shelter` |

---

## 6. 外部 LLM / Agent 的两种推荐对接方式

### 6.1 仅 JSON（无 tools）

- 系统提示：使用 `GAME_RULES_TEXT` 或 `buildRulesPrompt(额外说明)`（`agw-game-sdk/rules`）。
- 用户消息：附上 `readWorld` 得到的快照 JSON（可裁剪），以及上一轮 `submitAction` 返回结果。
- **要求模型只输出一个 JSON 对象**，字段：
  - `action`：字符串，须在当轮 `allowedActions` 内（经 `normalizeAction` 后仍须在列表内）
  - `payload`：对象，符合上表
  - `reason`：简短理由（可选但推荐，便于调试）

解析：

```js
import { parseModelAction, sanitizeModelOutput } from "agw-game-sdk/llm";

try {
  const { action, payload, reason } = parseModelAction(modelText, allowedActions);
} catch {
  const safe = sanitizeModelOutput(modelText, allowedActions, "harvest");
  // safe.parsed / safe.ok / safe.error
}
```

### 6.2 OpenAI 兼容 Tools（推荐强模型）

- 使用 `agw-game-sdk/llm` 中的 `AGW_TOOLS` 与 `executeTool`，由模型在单轮或多轮内调用 `read_world`、`get_agent`、`watch_surroundings` 及各动作工具。
- 详见包内 `README.md` 的 **LLM Demo** 与 `runAutoplayLoop` 说明；默认 `useTools: true`。

---

## 7. 语料评测与 `<Transaction>` / `[NONE]`

若你的流水线产出混合文本（例如 Thought + `<Transaction>...</Transaction>`），可用评测导出：

```js
import { evaluateModelOutput, collectFailureSamples } from "agw-game-sdk/eval";
```

- 显式拒绝：若输出含 `<Transaction>... [NONE] ...</Transaction>`（大小写不敏感），`evaluateModelOutput` 会视为合法「不动作」类结果（`canonical: "[NONE]"`）。
- 否则会尝试从 JSON 的 `"action"` 字段、或 `CALL: \`name(\``、或 `action: name` 行抽取候选，再 `normalizeAction` 并与允许列表比对。

---

## 8. 运行与环境注意点

1. **连接与签名**：具体参数表见 **第 2 节**。
2. **注册白名单**：若链上开启注册白名单，需管理员事先把地址加入白名单（SDK 提供 `enableRegistrationWhitelist`、`addWhitelistInChunks` 等，见主 `README.md`）。
3. **浏览器打包**：若用 Vite/Webpack 直接引用本包源码路径，依赖解析需以 SDK 包根目录的 `node_modules` 为准（`npm install` 在 `agw-game-sdk` 目录执行）。

---

## 9. 与仓库其它文档的关系

- **链与客户端跑法**：见仓库根目录 `docs/CHAIN_OPS_AND_INTEGRATION.md`（不在 npm 包内时，请向对方单独提供或链到你们 wiki）。
- **世界观与细规则**：`agw-game-sdk/rules` 内嵌英文规则；更完整的设定可能在主仓库 `agw.md` / wiki。

---

## 10. 版本与兼容性

集成时请在 issue/对接群里写明：**`agw-game-sdk` 版本号**、`@polkadot/api` 大版本、以及连接方式（ws / smoldot），以便排查元数据与 runtime 不匹配问题。
