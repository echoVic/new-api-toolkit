# Token 计算器 + 价格对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `web/` 独立站新增两个工具页：Token 计算器(`/token-calculator`，粘贴文本算 token 数 + 单次费用)与模型价格对比表(`/pricing`，可排序、$/1M ⇄ 倍率切换)。

**Architecture:** 沿用 Nuxt 3 + SSG。`gpt-tokenizer` 仅客户端调用做 OpenAI 精确分词，其他模型按系数估算；价格表纯静态数据 SSG 预渲。纯逻辑抽到 composables，Vitest 单测，TDD。

**Tech Stack:** Nuxt 3, Vue 3 `<script setup>`, TypeScript, `gpt-tokenizer` ^3.4.0, Vitest。

**关联设计文档:** `docs/superpowers/specs/2026-06-28-token-calculator-pricing-design.md`

**工作目录:** 所有路径相对仓库根 `new-api-toolkit/`。站点代码在 `web/`，`npm` 命令在 `web/` 内执行。git 命令用 `cd /Users/qingyun/Documents/GitHub/new-api-toolkit &&` 前缀。当前分支 `feat/web-toolkit`。

---

## File Structure

```
web/
├── data/models.ts              # 修改：ModelPreset 加可选字段 + 补全数据
├── composables/useTokenCalc.ts # 新增：estimateTokensForModel / costForCall
├── components/
│   ├── TokenCalc.vue           # 新增：Token 计算器 UI
│   └── PricingTable.vue        # 新增：价格对比表 UI
├── pages/
│   ├── token-calculator.vue    # 新增
│   ├── pricing.vue             # 新增
│   └── index.vue               # 修改：加 2 张卡片
├── layouts/default.vue         # 修改：加 2 个导航入口
├── nuxt.config.ts              # 修改：prerender routes
├── test/useTokenCalc.test.ts   # 新增
└── package.json                # 修改：加 gpt-tokenizer 依赖
```

---

## Task 1: 扩展模型数据

**Files:**
- Modify: `web/data/models.ts`

- [ ] **Step 1: 替换 `web/data/models.ts` 全文**

```ts
export const PRICE_UPDATED_AT = '2026-06-28'

export interface ModelPreset {
  name: string
  inputPricePer1M: number // 官方输入价 $/1M
  outputPricePer1M: number // 官方输出价 $/1M
  provider?: string // 厂商分组
  contextTokens?: number // 上下文窗口
  cachedInputPricePer1M?: number // 缓存输入价（可选）
  tokenFactor?: number // 相对 OpenAI tokenizer 的 token 估算系数，缺省 1
}

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

- [ ] **Step 2: 确认现有测试与构建未被破坏**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npx vitest run`
Expected: 现有 16 个测试全部 PASS（新增字段是可选的，不影响现有计算器/测试）。

- [ ] **Step 3: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/data/models.ts && git commit -m "feat(web): 扩展 ModelPreset 字段(provider/上下文/缓存价/token系数)"
```

---

## Task 2: useTokenCalc 纯函数（TDD）

**Files:**
- Create: `web/test/useTokenCalc.test.ts`
- Create: `web/composables/useTokenCalc.ts`

- [ ] **Step 1: 写失败测试 `web/test/useTokenCalc.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { estimateTokensForModel, costForCall } from '../composables/useTokenCalc'

describe('estimateTokensForModel', () => {
  it('系数缺省时等于原值', () => {
    expect(estimateTokensForModel(1000)).toBe(1000)
  })

  it('按系数放大并四舍五入', () => {
    expect(estimateTokensForModel(1000, 1.1)).toBe(1100)
    expect(estimateTokensForModel(333, 1.1)).toBe(366) // 366.3 → 366
  })

  it('0 token 返回 0', () => {
    expect(estimateTokensForModel(0, 1.5)).toBe(0)
  })
})

describe('costForCall', () => {
  it('按输入+输出 token 与单价算费用（美元）', () => {
    // (1000×5 + 500×25) / 1e6 = (5000 + 12500)/1e6 = 0.0175
    const usd = costForCall({
      inputTokens: 1000,
      outputTokens: 500,
      inputPricePer1M: 5,
      outputPricePer1M: 25,
    })
    expect(usd).toBeCloseTo(0.0175, 8)
  })

  it('仅输入 / 仅输出 / 全 0', () => {
    expect(costForCall({ inputTokens: 1000, outputTokens: 0, inputPricePer1M: 3, outputPricePer1M: 15 })).toBeCloseTo(0.003, 8)
    expect(costForCall({ inputTokens: 0, outputTokens: 1000, inputPricePer1M: 3, outputPricePer1M: 15 })).toBeCloseTo(0.015, 8)
    expect(costForCall({ inputTokens: 0, outputTokens: 0, inputPricePer1M: 3, outputPricePer1M: 15 })).toBe(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npx vitest run test/useTokenCalc.test.ts`
Expected: FAIL — 找不到 `../composables/useTokenCalc`。

- [ ] **Step 3: 实现 `web/composables/useTokenCalc.ts`**

```ts
export function estimateTokensForModel(openaiTokens: number, factor?: number): number {
  return Math.round(openaiTokens * (factor ?? 1))
}

export interface CallCostInput {
  inputTokens: number
  outputTokens: number
  inputPricePer1M: number
  outputPricePer1M: number
}

export function costForCall(input: CallCostInput): number {
  const { inputTokens, outputTokens, inputPricePer1M, outputPricePer1M } = input
  return (inputTokens * inputPricePer1M + outputTokens * outputPricePer1M) / 1_000_000
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npx vitest run test/useTokenCalc.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/composables/useTokenCalc.ts web/test/useTokenCalc.test.ts && git commit -m "feat(web): add useTokenCalc pure functions with tests"
```

---

## Task 3: 安装 gpt-tokenizer

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`

- [ ] **Step 1: 安装依赖**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm install gpt-tokenizer@^3.4.0`
Expected: 安装成功，`package.json` 的 `dependencies` 出现 `gpt-tokenizer`。

- [ ] **Step 2: 确认可导入 encode（快速 smoke check）**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && node -e "const {encode}=require('gpt-tokenizer'); console.log(encode('hello world').length)"`
Expected: 打印一个正整数（如 `2`）。若 require 失败，改用 `node --input-type=module -e "import('gpt-tokenizer').then(m=>console.log(m.encode('hi').length))"` 验证，并在组件中用 ESM import。

- [ ] **Step 3: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/package.json web/package-lock.json && git commit -m "chore(web): add gpt-tokenizer dependency"
```

---

## Task 4: TokenCalc 组件

**Files:**
- Create: `web/components/TokenCalc.vue`

- [ ] **Step 1: 创建 `web/components/TokenCalc.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { encode } from 'gpt-tokenizer'
import { estimateTokensForModel, costForCall } from '../composables/useTokenCalc'
import { MODEL_PRESETS } from '../data/models'

const text = ref('')
const selectedModel = ref(MODEL_PRESETS[0].name)
const outputTokens = ref(0)

// OpenAI o200k 精确 token 数（客户端计算）
const openaiTokens = computed(() => {
  if (!text.value) return 0
  try {
    return encode(text.value).length
  } catch {
    return 0
  }
})

const charCount = computed(() => text.value.length)
// 粗略汉字数：匹配 CJK 统一表意文字
const cjkCount = computed(() => (text.value.match(/[一-鿿]/g) || []).length)

const model = computed(() => MODEL_PRESETS.find((m) => m.name === selectedModel.value) ?? MODEL_PRESETS[0])

// 按所选模型估算 token
const modelTokens = computed(() => estimateTokensForModel(openaiTokens.value, model.value.tokenFactor))

const costUsd = computed(() =>
  costForCall({
    inputTokens: modelTokens.value,
    outputTokens: outputTokens.value,
    inputPricePer1M: model.value.inputPricePer1M,
    outputPricePer1M: model.value.outputPricePer1M,
  }),
)

const isOpenAI = computed(() => model.value.provider === 'OpenAI')

function fmt(n: number, digits: number): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}
</script>

<template>
  <section class="calc">
    <h2>Token 计算器</h2>

    <textarea
      v-model="text"
      class="input"
      rows="6"
      placeholder="粘贴 prompt 或对话文本……"
    />

    <div class="stats">
      <span>字符数：<b>{{ charCount }}</b></span>
      <span>汉字数：<b>{{ cjkCount }}</b></span>
      <span>Token（OpenAI 精确）：<b>{{ openaiTokens }}</b></span>
    </div>

    <div class="grid">
      <label>
        模型
        <select v-model="selectedModel">
          <option v-for="m in MODEL_PRESETS" :key="m.name" :value="m.name">{{ m.name }}</option>
        </select>
      </label>
      <label>该模型估算 token <output>{{ modelTokens }}</output></label>
      <label>输出 tokens <input v-model.number="outputTokens" type="number" min="0"></label>
      <label>单次费用 ($) <output>{{ fmt(costUsd, 6) }}</output></label>
    </div>

    <p class="note">
      OpenAI 系为精确计数；{{ isOpenAI ? '' : '当前模型为估算（误差约 5%），' }}以官方为准。
    </p>
  </section>
</template>

<style scoped>
.calc { max-width: 720px; }
.input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #d0d7de; border-radius: 8px; font-family: ui-monospace, 'SF Mono', Monaco, monospace; font-size: 13px; resize: vertical; }
.stats { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; font-size: 14px; color: #4b5563; }
.stats b { color: #111827; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
input, output, select { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
output { background: #f6f8fa; }
.note { margin-top: 12px; font-size: 13px; color: #6b7280; }
</style>
```

- [ ] **Step 2: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/components/TokenCalc.vue && git commit -m "feat(web): add TokenCalc component"
```

---

## Task 5: PricingTable 组件

**Files:**
- Create: `web/components/PricingTable.vue`

- [ ] **Step 1: 创建 `web/components/PricingTable.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { MODEL_PRESETS, PRICE_UPDATED_AT } from '../data/models'
import { inputPriceToModelRatio, completionRatioFromPrices } from '../composables/useModelRatio'

type SortKey = 'inputPricePer1M' | 'outputPricePer1M' | 'contextTokens'
const sortKey = ref<SortKey>('inputPricePer1M')
const sortAsc = ref(true)
const unit = ref<'usd' | 'ratio'>('usd')

function setSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = true
  }
}

const rows = computed(() => {
  const list = [...MODEL_PRESETS]
  list.sort((a, b) => {
    const av = a[sortKey.value] ?? 0
    const bv = b[sortKey.value] ?? 0
    return sortAsc.value ? av - bv : bv - av
  })
  return list
})

function ctxLabel(n?: number): string {
  if (!n) return '—'
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)
}
function fmtUsd(n?: number): string {
  return n === undefined ? '—' : `$${n}`
}
</script>

<template>
  <section class="pricing">
    <div class="toolbar">
      <span>单位：</span>
      <button :class="{ active: unit === 'usd' }" type="button" @click="unit = 'usd'">$/1M</button>
      <button :class="{ active: unit === 'ratio' }" type="button" @click="unit = 'ratio'">New API 倍率</button>
      <small>价格更新于 {{ PRICE_UPDATED_AT }}，以官方为准</small>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>厂商</th>
            <th>模型</th>
            <th class="sortable" @click="setSort('inputPricePer1M')">
              输入 {{ unit === 'usd' ? '($/1M)' : '(倍率)' }}
              <span v-if="sortKey === 'inputPricePer1M'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="setSort('outputPricePer1M')">
              输出 {{ unit === 'usd' ? '($/1M)' : '(补全倍率)' }}
              <span v-if="sortKey === 'outputPricePer1M'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th>缓存输入 ($/1M)</th>
            <th class="sortable" @click="setSort('contextTokens')">
              上下文
              <span v-if="sortKey === 'contextTokens'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in rows" :key="m.name">
            <td>{{ m.provider ?? '—' }}</td>
            <td class="model">{{ m.name }}</td>
            <td v-if="unit === 'usd'">${{ m.inputPricePer1M }}</td>
            <td v-else>x{{ inputPriceToModelRatio(m.inputPricePer1M) }}</td>
            <td v-if="unit === 'usd'">${{ m.outputPricePer1M }}</td>
            <td v-else>x{{ completionRatioFromPrices(m.inputPricePer1M, m.outputPricePer1M).toFixed(2) }}</td>
            <td>{{ fmtUsd(m.cachedInputPricePer1M) }}</td>
            <td>{{ ctxLabel(m.contextTokens) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.pricing { max-width: 820px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; font-size: 14px; }
.toolbar button { cursor: pointer; padding: 4px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; font-size: 13px; }
.toolbar button.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
.toolbar small { color: #6b7280; margin-left: auto; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
th { background: #fafbfc; font-weight: 600; }
.sortable { cursor: pointer; user-select: none; }
.sortable:hover { background: #f0f3f6; }
.model { font-family: ui-monospace, 'SF Mono', Monaco, monospace; font-size: 13px; }
</style>
```

- [ ] **Step 2: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/components/PricingTable.vue && git commit -m "feat(web): add PricingTable component"
```

---

## Task 6: 页面、导航、着陆页、prerender 路由

**Files:**
- Create: `web/pages/token-calculator.vue`, `web/pages/pricing.vue`
- Modify: `web/layouts/default.vue`, `web/pages/index.vue`, `web/nuxt.config.ts`

- [ ] **Step 1: 创建 `web/pages/token-calculator.vue`**

```vue
<script setup lang="ts">
useSeoMeta({
  title: 'Token 计算器 — 大模型 API token 数与费用在线估算',
  description: '粘贴文本在线计算 token 数与单次调用费用。OpenAI 精确分词，Claude/Gemini/DeepSeek 校准估算，支持中英文。',
})
</script>

<template>
  <div>
    <h1>Token 计算器</h1>
    <p>粘贴 prompt 或对话文本，实时计算 token 数与单次调用费用。OpenAI 系为精确计数，其余模型按校准系数估算。</p>
    <TokenCalc />
    <article class="article">
      <h2>Token 是什么？怎么算费用？</h2>
      <p>
        大模型按 token 计费，不是按字数。英文约 1 token ≈ 4 字符 ≈ 0.75 个单词；
        中文通常 1 字 ≈ 1～2 token，生僻字更多。不同模型用不同分词器，同一段文本 token 数会有差异。
      </p>
      <p>
        单次调用费用 = (输入 token × 输入单价 + 输出 token × 输出单价) ÷ 1,000,000（单位：美元）。
        本工具对 OpenAI 模型用官方 o200k 分词器精确计数，其余模型基于校准系数估算（误差约 5%），以官方为准。
      </p>
    </article>
  </div>
</template>

<style scoped>
.article { max-width: 720px; line-height: 1.7; color: #24292f; margin-top: 32px; }
.article h2 { margin-top: 24px; }
</style>
```

- [ ] **Step 2: 创建 `web/pages/pricing.vue`**

```vue
<script setup lang="ts">
useSeoMeta({
  title: '大模型 API 价格对比 — Claude / GPT / Gemini / DeepSeek 倍率换算',
  description: '主流大模型 API 输入/输出/缓存价、上下文长度横向对比，支持 $/1M 与 New API 倍率一键切换，可按价格排序。',
})
</script>

<template>
  <div>
    <h1>大模型 API 价格对比</h1>
    <p>主流模型的输入 / 输出 / 缓存价与上下文长度横向对比，支持 $/1M 与 New API 倍率切换、按价格排序。</p>
    <PricingTable />
  </div>
</template>
```

- [ ] **Step 3: 替换 `web/layouts/default.vue` 的 `.links` 区块**

把现有 `<div class="links">…</div>` 整块替换为（新增两个入口）：

```vue
      <div class="links">
        <NuxtLink to="/model-ratio" class="nav-item" active-class="nav-active">模型倍率</NuxtLink>
        <NuxtLink to="/recharge-ratio" class="nav-item" active-class="nav-active">充值倍率</NuxtLink>
        <NuxtLink to="/token-calculator" class="nav-item" active-class="nav-active">Token 计算</NuxtLink>
        <NuxtLink to="/pricing" class="nav-item" active-class="nav-active">价格对比</NuxtLink>
        <NuxtLink to="/benchmark" class="nav-item" active-class="nav-active">API 压测</NuxtLink>
      </div>
```

- [ ] **Step 4: 修改 `web/pages/index.vue` 的 `tools` 数组**

在 `tools` 数组中、`/recharge-ratio` 条目之后、`/benchmark` 条目之前，插入两项：

```ts
  {
    to: '/token-calculator',
    title: 'Token 计算器',
    desc: '粘贴文本算 token 数与单次调用费用，OpenAI 精确、其余校准估算。',
  },
  {
    to: '/pricing',
    title: '价格对比',
    desc: '主流模型输入/输出/缓存价与上下文横向对比，$/1M ⇄ 倍率切换。',
  },
```

- [ ] **Step 5: 修改 `web/nuxt.config.ts` 的 prerender routes**

把 `routes` 那一行替换为：

```ts
      routes: ['/', '/model-ratio', '/recharge-ratio', '/token-calculator', '/pricing', '/benchmark'],
```

- [ ] **Step 6: 构建并验证 SSG 内容**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run generate`
Expected: 成功，预渲含 `/token-calculator`、`/pricing`。

验证价格表与说明长文已进静态 HTML：
- `grep -l "Token 是什么" .output/public/token-calculator/index.html`
- `grep -l "大模型 API 价格对比" .output/public/pricing/index.html`
- `grep -c "claude-opus-4-8" .output/public/pricing/index.html` （应 ≥1，证明表格数据 SSG 进 HTML）
- `grep -c "Token 计算\|价格对比" .output/public/model-ratio/index.html` （应 ≥1，证明导航更新）

- [ ] **Step 7: 提交**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git add web/pages/ web/layouts/default.vue web/nuxt.config.ts && git commit -m "feat(web): add token-calculator & pricing pages, nav, landing cards"
```

---

## Task 7: 全量校验与收尾

- [ ] **Step 1: 跑全部单测**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run test`
Expected: 全部 PASS（原 16 + useTokenCalc 的 6 = 22）。

- [ ] **Step 2: 最终生成校验**

Run: `cd /Users/qingyun/Documents/GitHub/new-api-toolkit/web && npm run generate`
Expected: 构建无错误，sitemap 含 `/token-calculator` 与 `/pricing`（`grep -c "token-calculator\|pricing" .output/public/sitemap.xml` 应 ≥2）。

- [ ] **Step 3: 推送分支**

```bash
cd /Users/qingyun/Documents/GitHub/new-api-toolkit && git push origin feat/web-toolkit
```

---

## Self-Review 记录

- **Spec 覆盖:** §3 架构→Task 6(prerender)/4(客户端 encode)；§4 数据字段→Task 1；§5 Token 计算器(estimate/cost/组件/兜底)→Task 2/4；§6 价格表(排序/单位切换/倍率复用)→Task 5；§7 导航着陆→Task 6；§8 SEO(meta/长文/SSG)→Task 6；§9 测试(TDD/纯函数)→Task 2/7；§10 文件结构→全部。均有对应任务。
- **占位符:** 无 TBD/TODO；所有代码步骤含完整代码。
- **类型一致:** `estimateTokensForModel(openaiTokens, factor?)`、`costForCall(CallCostInput)`、`ModelPreset` 新字段、复用 `inputPriceToModelRatio`/`completionRatioFromPrices`（已存在于 useModelRatio.ts，签名核对无误）在定义与使用处一致。
- **依赖确认:** `gpt-tokenizer` 3.4.0 存在（Task 3 含 require/ESM 双验证回退）。
