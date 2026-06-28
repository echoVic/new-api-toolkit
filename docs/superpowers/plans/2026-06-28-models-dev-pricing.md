# 价格数据接入 models.dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 价格表/Token 计算器/倍率预设改用真实数据——构建时从 models.dev 拉取，按 provider 白名单筛选生成数据文件，拉取失败回退到入仓的 fallback。

**Architecture:** 纯映射函数 `lib/mapModelsDev.ts`(可单测) + Node 脚本 `scripts/fetch-prices.mjs`(IO + 写文件 + 回退)。`data/models.ts` 固定 re-export `models.generated.ts`(脚本保证总存在)。类型定义独立到 `data/modelPreset.ts`。

**Tech Stack:** Nuxt 3, TypeScript, Vitest, Node `fetch`(Node 22 内置)。

**关联设计文档:** `docs/superpowers/specs/2026-06-28-models-dev-pricing-design.md`

**工作目录:** 路径相对仓库根 `new-api-toolkit/`，站点在 `web/`，`npm`/`node` 命令在 `web/` 内执行。git 用 `cd /Users/qingyun/Documents/GitHub/new-api-toolkit &&` 前缀。分支 `feat/web-toolkit`。

**已验证事实(来自 models.dev/api.json 实拉):**
- 顶层按 provider 嵌套；白名单 9 个 provider 均为顶层 key 且有数据：`anthropic`(23)、`openai`(51)、`google`(22)、`deepseek`(4)、`xai`(8)、`zhipuai`(13)、`moonshotai`(9)、`minimax`(7)、`mistral`(30)。
- 模型结构：`{ id, name, release_date, limit: { context, output }, cost: { input, output, cache_read?, cache_write? } }`。无价模型 `cost` 可能缺 `input`。

---

## File Structure

```
web/
├── data/
│   ├── modelPreset.ts            # 新增：ModelPreset 接口（稳定，入仓）
│   ├── models.fallback.ts        # 新增：入仓兜底数据（≈现有 7 真实模型）
│   ├── models.generated.ts       # 脚本生成（gitignore，不入仓）
│   └── models.ts                 # 改：固定 re-export generated + 类型
├── lib/mapModelsDev.ts           # 新增：纯映射函数
├── scripts/fetch-prices.mjs      # 新增：拉取 + 调映射 + 写 generated + 回退
├── test/mapModelsDev.test.ts     # 新增
├── package.json                  # 改：generate/dev script 前置拉取
├── .gitignore                    # 改：忽略 data/models.generated.ts
└── README.md                     # 改：价格数据说明
```

现有 `web/data/models.ts`(含 `ModelPreset` 接口 + `PRICE_UPDATED_AT` + `MODEL_PRESETS` 7 模型)将被拆分：接口→`modelPreset.ts`，数据→`models.fallback.ts`，入口→新的 `models.ts`。

---

## Task 1: 拆分类型与兜底数据，建立入口

**Files:**
- Create: `web/data/modelPreset.ts`
- Create: `web/data/models.fallback.ts`
- Create: `web/data/models.generated.ts`（手动建初始版 = fallback 内容；后续由脚本覆盖）
- Modify: `web/data/models.ts`
- Modify: `web/.gitignore`

- [ ] **Step 1: 创建 `web/data/modelPreset.ts`**

```ts
export interface ModelPreset {
  name: string
  inputPricePer1M: number // 官方输入价 $/1M
  outputPricePer1M: number // 官方输出价 $/1M
  provider?: string // 厂商分组
  contextTokens?: number // 上下文窗口
  cachedInputPricePer1M?: number // 缓存输入价（可选）
  tokenFactor?: number // 相对 OpenAI tokenizer 的 token 估算系数，缺省 1
}
```

- [ ] **Step 2: 创建 `web/data/models.fallback.ts`**

```ts
import type { ModelPreset } from './modelPreset'

export const PRICE_UPDATED_AT = '2026-06-28'

// 兜底数据：当 models.dev 拉取失败时使用。手工维护的真实快照。
export const MODEL_PRESETS: ModelPreset[] = [
  { name: 'claude-opus-4-8', inputPricePer1M: 5, outputPricePer1M: 25, provider: 'Anthropic', contextTokens: 1000000, cachedInputPricePer1M: 0.5, tokenFactor: 1 },
  { name: 'claude-sonnet-4-6', inputPricePer1M: 3, outputPricePer1M: 15, provider: 'Anthropic', contextTokens: 1000000, cachedInputPricePer1M: 0.3, tokenFactor: 1 },
  { name: 'claude-haiku-4-5', inputPricePer1M: 1, outputPricePer1M: 5, provider: 'Anthropic', contextTokens: 200000, cachedInputPricePer1M: 0.1, tokenFactor: 1 },
  { name: 'gpt-5.5', inputPricePer1M: 5, outputPricePer1M: 30, provider: 'OpenAI', contextTokens: 1050000, cachedInputPricePer1M: 0.5, tokenFactor: 1 },
  { name: 'gpt-5.4', inputPricePer1M: 2.5, outputPricePer1M: 15, provider: 'OpenAI', contextTokens: 1050000, cachedInputPricePer1M: 0.25, tokenFactor: 1 },
  { name: 'gemini-3-pro', inputPricePer1M: 2, outputPricePer1M: 12, provider: 'Google', contextTokens: 2000000, cachedInputPricePer1M: 0.2, tokenFactor: 1 },
  { name: 'deepseek-v3', inputPricePer1M: 0.27, outputPricePer1M: 1.1, provider: 'DeepSeek', contextTokens: 128000, tokenFactor: 1.1 },
]
```

- [ ] **Step 3: 创建 `web/data/models.generated.ts`（初始版 = 复制 fallback 的导出，脚本之后会覆盖）**

```ts
import type { ModelPreset } from './modelPreset'

export const PRICE_UPDATED_AT = '2026-06-28'

export const MODEL_PRESETS: ModelPreset[] = [
  { name: 'claude-opus-4-8', inputPricePer1M: 5, outputPricePer1M: 25, provider: 'Anthropic', contextTokens: 1000000, cachedInputPricePer1M: 0.5, tokenFactor: 1 },
  { name: 'claude-sonnet-4-6', inputPricePer1M: 3, outputPricePer1M: 15, provider: 'Anthropic', contextTokens: 1000000, cachedInputPricePer1M: 0.3, tokenFactor: 1 },
  { name: 'claude-haiku-4-5', inputPricePer1M: 1, outputPricePer1M: 5, provider: 'Anthropic', contextTokens: 200000, cachedInputPricePer1M: 0.1, tokenFactor: 1 },
  { name: 'gpt-5.5', inputPricePer1M: 5, outputPricePer1M: 30, provider: 'OpenAI', contextTokens: 1050000, cachedInputPricePer1M: 0.5, tokenFactor: 1 },
  { name: 'gpt-5.4', inputPricePer1M: 2.5, outputPricePer1M: 15, provider: 'OpenAI', contextTokens: 1050000, cachedInputPricePer1M: 0.25, tokenFactor: 1 },
  { name: 'gemini-3-pro', inputPricePer1M: 2, outputPricePer1M: 12, provider: 'Google', contextTokens: 2000000, cachedInputPricePer1M: 0.2, tokenFactor: 1 },
  { name: 'deepseek-v3', inputPricePer1M: 0.27, outputPricePer1M: 1.1, provider: 'DeepSeek', contextTokens: 128000, tokenFactor: 1.1 },
]
```

- [ ] **Step 4: 用入口内容覆盖 `web/data/models.ts`**

```ts
// 入口：脚本保证 models.generated.ts 总存在（拉取成功=真实数据，失败=fallback 复制）。
// 现有 `from '../data/models'` 引用无需改动。
export type { ModelPreset } from './modelPreset'
export { PRICE_UPDATED_AT, MODEL_PRESETS } from './models.generated'
```

- [ ] **Step 5: `web/.gitignore` 末尾追加一行**

```
data/models.generated.ts
```

- [ ] **Step 6: 验证现有测试与构建未破坏**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npx vitest run && npm run generate`
Expected: 现有测试全 PASS；generate 成功（入口 → generated → 数据齐全）。

- [ ] **Step 7: 提交（注意 generated.ts 已被 gitignore，不会进提交）**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/data/modelPreset.ts web/data/models.fallback.ts web/data/models.ts web/.gitignore && git commit -m "refactor(web): 拆分 ModelPreset 类型与 fallback 数据，建立 models 入口"
```

> 注：`web/data/models.generated.ts` 此时存在于工作区但被 gitignore，不入仓——这是预期。

---

## Task 2: 纯映射函数 mapModelsDev（TDD）

**Files:**
- Create: `web/test/mapModelsDev.test.ts`
- Create: `web/lib/mapModelsDev.ts`

- [ ] **Step 1: 写失败测试 `web/test/mapModelsDev.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mapModelsDevToPresets } from '../lib/mapModelsDev'

const SAMPLE = {
  anthropic: {
    name: 'Anthropic',
    models: {
      'claude-opus-4-5': {
        id: 'claude-opus-4-5',
        name: 'Claude Opus 4.5',
        release_date: '2025-11-24',
        limit: { context: 200000, output: 64000 },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
      'no-price-model': {
        id: 'no-price-model',
        name: 'No Price',
        limit: { context: 1000 },
        cost: {}, // 无 input → 应被过滤
      },
    },
  },
  deepseek: {
    name: 'DeepSeek',
    models: {
      'deepseek-chat': {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        release_date: '2025-01-01',
        limit: { context: 128000 },
        cost: { input: 0.27, output: 1.1 }, // 无 cache_read
      },
    },
  },
  // 不在白名单 → 整体跳过
  someaggregator: {
    name: 'Agg',
    models: { 'x/y': { id: 'x/y', cost: { input: 1, output: 2 }, limit: { context: 100 } } },
  },
}

const OPTS = {
  providerWhitelist: ['anthropic', 'deepseek'],
  tokenFactors: { deepseek: 1.1 },
}

describe('mapModelsDevToPresets', () => {
  it('按白名单筛选 provider，跳过非白名单', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    expect(out.find((m) => m.name === 'x/y')).toBeUndefined()
  })

  it('过滤无 cost.input 的模型', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    expect(out.find((m) => m.name === 'no-price-model')).toBeUndefined()
  })

  it('字段映射正确', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    const opus = out.find((m) => m.name === 'claude-opus-4-5')!
    expect(opus.inputPricePer1M).toBe(5)
    expect(opus.outputPricePer1M).toBe(25)
    expect(opus.cachedInputPricePer1M).toBe(0.5)
    expect(opus.contextTokens).toBe(200000)
    expect(opus.provider).toBe('Anthropic')
  })

  it('cache_read 缺失时不设 cachedInputPricePer1M', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    const ds = out.find((m) => m.name === 'deepseek-chat')!
    expect(ds.cachedInputPricePer1M).toBeUndefined()
  })

  it('tokenFactor 按 provider 补值，缺省为 1', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    expect(out.find((m) => m.name === 'deepseek-chat')!.tokenFactor).toBe(1.1)
    expect(out.find((m) => m.name === 'claude-opus-4-5')!.tokenFactor).toBe(1)
  })

  it('空/缺字段不抛错', () => {
    expect(() => mapModelsDevToPresets({}, OPTS)).not.toThrow()
    expect(mapModelsDevToPresets({}, OPTS)).toEqual([])
    expect(() => mapModelsDevToPresets({ anthropic: {} }, OPTS)).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npx vitest run test/mapModelsDev.test.ts`
Expected: FAIL — 找不到 `../lib/mapModelsDev`。

- [ ] **Step 3: 实现 `web/lib/mapModelsDev.ts`**

```ts
import type { ModelPreset } from '../data/modelPreset'

interface MapOpts {
  providerWhitelist: string[]
  tokenFactors: Record<string, number>
}

export function mapModelsDevToPresets(apiJson: unknown, opts: MapOpts): ModelPreset[] {
  const data = (apiJson ?? {}) as Record<string, any>
  const out: ModelPreset[] = []

  for (const providerId of opts.providerWhitelist) {
    const provider = data[providerId]
    if (!provider || typeof provider !== 'object') continue
    const models = provider.models
    if (!models || typeof models !== 'object') continue
    const providerName = typeof provider.name === 'string' ? provider.name : providerId
    const factor = opts.tokenFactors[providerId] ?? 1

    for (const model of Object.values(models) as any[]) {
      const cost = model?.cost
      if (!cost || typeof cost.input !== 'number') continue // 过滤无价模型

      const preset: ModelPreset = {
        name: typeof model.name === 'string' && model.name ? model.id ?? model.name : model.id,
        inputPricePer1M: cost.input,
        outputPricePer1M: typeof cost.output === 'number' ? cost.output : 0,
        provider: providerName,
        tokenFactor: factor,
      }
      if (typeof model?.limit?.context === 'number') preset.contextTokens = model.limit.context
      if (typeof cost.cache_read === 'number') preset.cachedInputPricePer1M = cost.cache_read
      out.push(preset)
    }
  }

  return out
}
```

> 说明：`name` 取 `model.id`（稳定标识，如 `claude-opus-4-5`），与现有表展示风格一致。`cost.output` 缺失兜底 0（极少见）。`tiers` 字段忽略（取基础 `cost.input/output`）。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npx vitest run test/mapModelsDev.test.ts`
Expected: PASS（6 个测试）。

- [ ] **Step 5: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/lib/mapModelsDev.ts web/test/mapModelsDev.test.ts && git commit -m "feat(web): add mapModelsDevToPresets pure function with tests"
```

---

## Task 3: 拉取脚本 fetch-prices.mjs

**Files:**
- Create: `web/scripts/fetch-prices.mjs`

- [ ] **Step 1: 创建 `web/scripts/fetch-prices.mjs`**

```js
// 构建前运行：从 models.dev 拉取真实价格，生成 data/models.generated.ts。
// 拉取/解析失败时回退复制 data/models.fallback.ts 的内容，构建不中断。
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'data')
const generatedPath = join(dataDir, 'models.generated.ts')
const fallbackPath = join(dataDir, 'models.fallback.ts')

const PROVIDER_WHITELIST = [
  'anthropic', 'openai', 'google', 'deepseek', 'xai',
  'zhipuai', 'moonshotai', 'minimax', 'mistral',
]
const TOKEN_FACTORS = {
  deepseek: 1.1, zhipuai: 1.1, moonshotai: 1.1, minimax: 1.1, alibaba: 1.1,
}

// 与 lib/mapModelsDev.ts 同逻辑（脚本是 .mjs，不能 import .ts，故内联一份）。
function mapModelsDevToPresets(apiJson, opts) {
  const data = apiJson ?? {}
  const out = []
  for (const providerId of opts.providerWhitelist) {
    const provider = data[providerId]
    if (!provider || typeof provider !== 'object') continue
    const models = provider.models
    if (!models || typeof models !== 'object') continue
    const providerName = typeof provider.name === 'string' ? provider.name : providerId
    const factor = opts.tokenFactors[providerId] ?? 1
    for (const model of Object.values(models)) {
      const cost = model?.cost
      if (!cost || typeof cost.input !== 'number') continue
      const preset = {
        name: model.id,
        inputPricePer1M: cost.input,
        outputPricePer1M: typeof cost.output === 'number' ? cost.output : 0,
        provider: providerName,
        tokenFactor: factor,
      }
      if (typeof model?.limit?.context === 'number') preset.contextTokens = model.limit.context
      if (typeof cost.cache_read === 'number') preset.cachedInputPricePer1M = cost.cache_read
      out.push(preset)
    }
  }
  return out
}

function renderModule(presets, updatedAt) {
  return `import type { ModelPreset } from './modelPreset'

// 自动生成：源 https://models.dev/api.json — 请勿手改。
export const PRICE_UPDATED_AT = ${JSON.stringify(updatedAt)}

export const MODEL_PRESETS: ModelPreset[] = ${JSON.stringify(presets, null, 2)}
`
}

async function useFallback(reason) {
  console.warn(`⚠ 拉取 models.dev 失败（${reason}），使用 fallback 数据`)
  const content = await readFile(fallbackPath, 'utf8')
  await writeFile(generatedPath, content, 'utf8')
}

async function main() {
  try {
    const resp = await fetch('https://models.dev/api.json')
    if (!resp.ok) return await useFallback(`HTTP ${resp.status}`)
    const json = await resp.json()
    const presets = mapModelsDevToPresets(json, {
      providerWhitelist: PROVIDER_WHITELIST,
      tokenFactors: TOKEN_FACTORS,
    })
    if (presets.length === 0) return await useFallback('映射结果为空')
    const today = new Date().toISOString().slice(0, 10)
    await writeFile(generatedPath, renderModule(presets, today), 'utf8')
    console.log(`✓ 已从 models.dev 生成 ${presets.length} 个模型价格 → data/models.generated.ts`)
  } catch (err) {
    await useFallback(err?.message || String(err))
  }
}

main()
```

> 注：脚本内联了一份 `mapModelsDevToPresets`（与 `lib/mapModelsDev.ts` 同逻辑）——因为 `.mjs` 不能直接 import `.ts`。`lib/mapModelsDev.ts` 是该逻辑的可单测真源；两份保持一致（如改逻辑需同步）。`new Date()` 在 Node 脚本中正常可用（仅 Workflow 沙箱禁用，此处是普通构建脚本）。

- [ ] **Step 2: 运行脚本，确认生成真实数据**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && node scripts/fetch-prices.mjs`
Expected: 打印 `✓ 已从 models.dev 生成 N 个模型价格`（N 为几十）。若无网络则打印 fallback 警告——两种都算成功（容错生效）。

- [ ] **Step 3: 确认生成文件内容合理**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && head -20 data/models.generated.ts && grep -c "inputPricePer1M" data/models.generated.ts`
Expected: 文件含 `export const MODEL_PRESETS`，条目数与 N 一致；含 `claude` 与 `gpt` 相关条目（联网时）。

- [ ] **Step 4: 确认仍能构建**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run generate`
Expected: 成功，价格表用上生成的数据。

- [ ] **Step 5: 提交（generated.ts 被 gitignore，不入仓）**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/scripts/fetch-prices.mjs && git commit -m "feat(web): add models.dev price fetch script with fallback"
```

---

## Task 4: 构建集成 + 文档

**Files:**
- Modify: `web/package.json`
- Modify: `web/README.md`

- [ ] **Step 1: 修改 `web/package.json` 的 scripts**

把 `scripts` 中的 `generate` 与 `dev` 改为前置拉取（保留其他不变）：

```json
  "scripts": {
    "dev": "node scripts/fetch-prices.mjs && nuxt dev",
    "build": "nuxt build",
    "generate": "node scripts/fetch-prices.mjs && nuxt generate",
    "preview": "nuxt preview",
    "test": "vitest run"
  }
```

> 用显式 `&&` 串联而非 `prebuild`/`predev` 钩子——因为部署用的是 `npm run generate`，显式串联最直观且确保 CF 构建命令 `npm run generate` 一定触发拉取。

- [ ] **Step 2: 验证 generate 会先拉取**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run generate 2>&1 | head -5`
Expected: 输出开头出现脚本的 `✓ 已从 models.dev 生成…` 或 fallback 警告，随后 Nuxt 构建。

- [ ] **Step 3: 在 `web/README.md` 增加"价格数据"小节**

在 README 末尾追加：

```markdown
## 价格数据

模型价格来自开源数据库 [models.dev](https://models.dev/)（MIT），构建时由 `scripts/fetch-prices.mjs` 自动拉取 `https://models.dev/api.json`，按 provider 白名单筛选生成 `data/models.generated.ts`（不入仓）。

- 拉取失败时自动回退到 `data/models.fallback.ts`（入仓的真实快照），构建不中断。
- 手动刷新：`cd web && node scripts/fetch-prices.mjs`
- 调整收录范围：编辑 `scripts/fetch-prices.mjs` 顶部的 `PROVIDER_WHITELIST`。
```

- [ ] **Step 4: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/package.json web/README.md && git commit -m "chore(web): generate/dev 前置拉取价格 + README 价格数据说明"
```

---

## Task 5: 全量校验、收尾、推送

- [ ] **Step 1: 全量测试**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run test`
Expected: 全部 PASS（原 21 + mapModelsDev 6 = 27）。

- [ ] **Step 2: 完整生成 + 验证真实数据进静态页**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run generate`
然后（联网时）：`grep -c "claude" .output/public/pricing/index.html`
Expected: 构建成功；价格表 HTML 含真实模型（≥1）。

- [ ] **Step 3: 确认 generated.ts 未被提交**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git status --short && git ls-files web/data/models.generated.ts`
Expected: `git ls-files` 输出为空（未跟踪）；`git status` 干净或只有无关改动。

- [ ] **Step 4: 推送**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git push origin feat/web-toolkit
```

---

## Self-Review 记录

- **Spec 覆盖:** §3 架构(脚本/入口/fallback)→Task 1/3；§4 字段映射→Task 2/3；§5 白名单→Task 3(已用实拉验证的 9 个真实 provider key)；§6 tokenFactor→Task 2/3；§7 纯函数→Task 2；§8 失败容错→Task 3(useFallback)；§9 构建集成→Task 4；§10 测试→Task 2/5；§11 文档→Task 4。均覆盖。
- **占位符:** 无 TBD/TODO；所有步骤含完整代码。
- **类型一致:** `ModelPreset`(modelPreset.ts)、`mapModelsDevToPresets(apiJson, {providerWhitelist, tokenFactors})`、`MODEL_PRESETS`/`PRICE_UPDATED_AT` 导出名在 fallback/generated/入口/脚本生成处一致。
- **已知取舍:** 脚本内联映射逻辑(与 lib/mapModelsDev.ts 同源,因 .mjs 不能 import .ts),计划已注明需同步;models.dev 当前快照模型代际可能与手填 fallback 略有差异(如 Opus 4.5 vs 4.8),但这是用户要的"真实权威源"。
- **回退正确性:** 入口固定 import generated;脚本保证 generated 总存在(成功=真实,失败=复制 fallback)→ import 永不失败。Task 1 手建初始 generated 确保脚本未跑时也能构建/测试。
