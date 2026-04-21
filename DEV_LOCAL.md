# 本地开发目录 `dev-local/`

`internal/full-dev` 与公开分支 `main` 的 **tracked 树对齐**：测试、示例、脚本、CI、长文档等放在 **`dev-local/`**，并通过 `.gitignore` **不提交到 GitHub**。

克隆仓库后若需要跑测试或示例，请自建 `dev-local/`（或从备份分支 `backup/full-dev-before-align` 检出旧路径），并保证 import 使用相对仓库根的路径（例如 `dev-local/test` 内为 `../../src/...`、`../../../rules/...`）。

## 运行单元测试（仓库根目录）

```bash
node --test ./dev-local/test/*.test.js
```

## 主网烟测（示例）

```bash
node ./dev-local/scripts/integration-mainnet-smoke.mjs
```

## 合并约定

- 对外发布能力只改仓库根的 `src/`、`assets/`、`rules/`、`README.md`、`package.json`、`LICENSE`。
- `dev-local/` 仅本机或团队私有同步，不参与 `main` 的 npm 包内容。
