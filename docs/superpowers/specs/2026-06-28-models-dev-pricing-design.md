# 价格数据接入 models.dev 设计文档

- 日期：2026-06-28
- 状态：已获批，待生成实现计划
- 所属项目：new-api-toolkit / `web/` 独立站

## 1. 背景与目标

价格对比表与 Token 计算器当前使用手填的 7 个模型价格（部分缓存价为估算），不可信。改为**构建时从 models.dev 拉取真实价格**（开源、MIT、社区维护、`GET https://models.dev/api.json` 单请求即可拿全），自动生成数据文件，价格随每次部署刷新。

目标：价格表/Token 计算器/倍率预设全部使用真实权威数据，保持纯静态 SSG、零运行时依赖、零滥用风险。

## 2. 决策记录

| 项 | 决策 | 理由 |
|---|---|---|
| 数据源 | models.dev `api.json` | 字段几乎 1:1 对应现有 ModelPreset，含 cache_read/cache_write/context |
| 模型范围 | 按 provider 白名单筛选主流厂商 | 真实可控、不臃肿（避免上千冷门/嵌入模型） |
| 生成形态 | 构建时现拉，生成文件**不入仓** | 价格随部署刷新 |
| 拉取失败 | fallback 兜底，构建不挂 | models.dev 临时不可用时仍能部署 |
| 入口解析 | 脚本兜底法（脚本总会生成 generated.ts） | TS 静态 import 不支持文件缺失 try/catch；保证 import 永远有效 |

## 3. 架构

```
web/
├── scripts/fetch-prices.mjs       # 新增：拉取 + 映射 + 写 generated.ts
├── data/
│   ├── modelPreset.ts             # 新增：ModelPreset 接口定义（稳定，入仓）
│   ├── models.ts                  # 修改：入口，re-export generated + 类型
│   ├── models.generated.ts        # 脚本生成（gitignore，不入仓）
│   └── models.fallback.ts         # 新增：入仓兜底数据（≈现有 7 真实模型）
├── lib/mapModelsDev.ts            # 新增：纯映射函数（可单测）
└── test/mapModelsDev.test.ts      # 新增
```

### 数据流
1. 构建前（`generate` 触发）运行 `scripts/fetch-prices.mjs`：
   - `fetch('https://models.dev/api.json')`
   - 调用 `mapModelsDevToPresets(apiJson)` 筛选 + 映射成 `ModelPreset[]`
   - 写入 `data/models.generated.ts`（`export const PRICE_UPDATED_AT` + `export const MODEL_PRESETS`）
2. 拉取/解析失败：脚本**不抛出致命错误**，改为将 `models.fallback.ts` 的内容复制生成为 `models.generated.ts`，打印警告，退出码 0。
3. `data/models.ts` 永远 `export * from './models.generated'`，因此 import 永远有效。

### 入口解析（脚本兜底法）
- `ModelPreset` 接口定义放在独立文件 `data/modelPreset.ts`（稳定、入仓），供 generated / fallback / 入口共同 import，避免循环依赖。
- `data/models.fallback.ts`：`import type { ModelPreset } from './modelPreset'` + 导出 `PRICE_UPDATED_AT` 与 `MODEL_PRESETS`（真实兜底数据）。
- `data/models.generated.ts`（脚本生成）：同样 `import type { ModelPreset } from './modelPreset'` + 导出 `PRICE_UPDATED_AT` 与 `MODEL_PRESETS`。
- `data/models.ts` 内容固定：`export type { ModelPreset } from './modelPreset'` + `export { PRICE_UPDATED_AT, MODEL_PRESETS } from './models.generated'`。
- 脚本**保证** `models.generated.ts` 总存在（成功=真实数据，失败=复制 fallback 数据）。因此 import 永远有效，现有 `from '../data/models'` 引用不变。

## 4. 字段映射（models.dev → ModelPreset）

models.dev 结构：顶层按 provider 嵌套，`provider.models[modelId]` 含 `{ id, name, cost: { input, output, cache_read, cache_write, tiers? }, limit: { context, output } }`。

| ModelPreset 字段 | 来源 |
|---|---|
| `name` | model `id`（或 `name`） |
| `inputPricePer1M` | `cost.input` |
| `outputPricePer1M` | `cost.output` |
| `cachedInputPricePer1M` | `cost.cache_read`（缺则不设） |
| `contextTokens` | `limit.context` |
| `provider` | provider 显示名 |
| `tokenFactor` | 脚本按 provider 补经验值（见 §6） |

- 只取有 `cost.input` 的 chat 模型（过滤 embedding/无价模型）。
- `cost.tiers` 存在时取基础档（第一档）价格，忽略分层。
- 同名模型多 provider 提供时，取白名单中 canonical provider 的条目，去重。

## 5. provider 白名单

脚本顶部常量（可增减）：

```
anthropic, openai, google, deepseek, xai, meta, alibaba(qwen), zhipuai(glm), moonshotai(kimi)
```

每个 provider 取其主流 chat 模型（有价格的）。具体 provider id 以 models.dev 实际 key 为准（脚本中按 id 匹配，未命中的 provider 跳过并 warn）。

## 6. tokenFactor 处理

models.dev 无此字段（自定义估算系数）。脚本按 provider 补经验值：

```
OpenAI / Anthropic / Google / xAI / Meta → 1
DeepSeek / Qwen / GLM / Kimi（中文 token 偏多）→ 1.1
其余 → 1
```

兜底常量表在脚本内。

## 7. 纯映射函数（`lib/mapModelsDev.ts`）

```ts
mapModelsDevToPresets(apiJson: unknown, opts: {
  providerWhitelist: string[]
  tokenFactors: Record<string, number>
}): ModelPreset[]
```

- 无副作用、不联网，纯数据转换 → 可单测。
- 脚本 `fetch-prices.mjs` 负责 IO（fetch + 写文件 + fallback），调用此纯函数做转换。

## 8. 失败容错

- `fetch` 抛错 / 非 2xx / JSON 解析失败 / 映射结果为空 → 脚本打印 `⚠ 拉取 models.dev 失败，使用 fallback`，复制 `models.fallback.ts` → `models.generated.ts`，退出码 0（构建继续）。
- `mapModelsDevToPresets` 对缺字段的模型跳过而非崩溃。

## 9. 构建集成

- `package.json` 加 `"prebuild": "node scripts/fetch-prices.mjs"` 与 `"predev": "node scripts/fetch-prices.mjs"`（`nuxt generate` 走 build 生命周期；若 generate 不触发 prebuild，则在 `generate` script 前显式 `node scripts/fetch-prices.mjs && nuxt generate`）。
- Cloudflare Pages 构建命令不变：`cd web && npm install && npm run generate`（脚本在 generate 前自动跑）。
- `.gitignore` 增加 `web/data/models.generated.ts`。

## 10. 测试

- **Vitest** 测 `mapModelsDevToPresets`：
  - 样例 models.dev JSON → 正确筛选白名单 provider
  - 字段映射正确（input/output/cache_read/context/name）
  - 过滤无 `cost.input` 的模型
  - tiers 取基础档
  - tokenFactor 按 provider 补值
  - 空/缺字段容错（跳过而非抛错）
- 不测网络 fetch / 文件写入。
- `npm run generate` 验证生成数据进静态 HTML（价格表含真实模型）。
- 现有 22 个测试不受影响（fallback 提供同样的 `ModelPreset`/`MODEL_PRESETS` 接口）。

## 11. 文档

- `web/README.md` 增加"价格数据"小节：来源 models.dev、构建时自动拉取、fallback 机制、如何手动刷新（`node scripts/fetch-prices.mjs`）。

## 12. 非目标（YAGNI）

- 运行时 Worker 代理 / KV 缓存（构建时刷新已足够）
- 历史价格走势
- 多源交叉校验（LiteLLM / genai-prices）
- provider logo 展示（models.dev 提供，本次不接）
