# 倍率计算器独立站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Nuxt 3 + SSG 做一个倍率计算器独立站（模型倍率换算 + 充值倍率换算两个计算器），部署到 Cloudflare Pages，主攻 SEO。

**Architecture:** 纯静态站点（`nuxt generate`），无后端。计算逻辑抽到 `composables/` 纯函数（TDD 单测），UI 组件只管输入绑定与展示，页面用 `useSeoMeta` 管 SEO 并 SSG 预渲出真 HTML。

**Tech Stack:** Nuxt 3, Vue 3 `<script setup>`, TypeScript, Vitest, `@nuxtjs/sitemap`, Cloudflare Pages。

**关联设计文档:** `docs/superpowers/specs/2026-06-28-rate-calculator-site-design.md`

**工作目录:** 所有路径相对仓库根 `new-api-toolkit/`。站点代码在 `web/` 子目录。所有 `npm` 命令在 `web/` 内执行。

---

## File Structure

```
web/
├── package.json             # 依赖与脚本
├── nuxt.config.ts           # SSG + sitemap + 站点 SEO 默认
├── tsconfig.json            # 继承 .nuxt/tsconfig
├── vitest.config.ts         # Vitest 配置
├── app.vue                  # 根布局 + 导航
├── pages/
│   ├── index.vue            # 着陆 + 双计算器
│   ├── model-ratio.vue      # 模型倍率独立页
│   └── recharge-ratio.vue   # 充值倍率独立页
├── components/
│   ├── ModelRatioCalc.vue   # 模型倍率 UI
│   ├── RechargeRatioCalc.vue# 充值倍率 UI
│   └── SeoArticle.vue       # 公式说明长文（带 prop 选段）
├── composables/
│   ├── useModelRatio.ts     # 纯函数：倍率↔价、费用估算
│   └── useRechargeRatio.ts  # 纯函数：充值换算
├── data/
│   └── models.ts            # 主流模型预设价
└── test/
    ├── useModelRatio.test.ts
    └── useRechargeRatio.test.ts
```

**职责边界:** `composables/` 是无 DOM 依赖的纯计算（可单测）；`components/` 只做 UI 与输入绑定，调用 composables；`data/models.ts` 集中预设；`pages/` 负责路由与 SEO meta。

---

## Task 1: 脚手架 — 创建 Nuxt 3 项目与依赖

**Files:**
- Create: `web/package.json`
- Create: `web/nuxt.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/app.vue`
- Create: `web/.gitignore`

- [ ] **Step 1: 创建 `web/package.json`**

```json
{
  "name": "new-api-toolkit-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@nuxtjs/sitemap": "^7.0.0",
    "nuxt": "^3.13.0",
    "vitest": "^2.1.0",
    "vue": "^3.5.0"
  }
}
```

- [ ] **Step 2: 创建 `web/nuxt.config.ts`**

```ts
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-06-28',
  ssr: true,
  modules: ['@nuxtjs/sitemap'],
  site: {
    // 部署后改成真实域名
    url: 'https://example.com',
    name: 'New API 倍率计算器',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/model-ratio', '/recharge-ratio'],
    },
  },
})
```

- [ ] **Step 3: 创建 `web/tsconfig.json`**

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

- [ ] **Step 4: 创建 `web/.gitignore`**

```
node_modules
.nuxt
.output
dist
.data
```

- [ ] **Step 5: 创建占位 `web/app.vue`（后续 Task 7 替换为完整导航）**

```vue
<template>
  <div>
    <NuxtPage />
  </div>
</template>
```

- [ ] **Step 6: 安装依赖**

Run: `cd web && npm install`
Expected: 安装成功，生成 `web/package-lock.json` 与 `web/node_modules`。

- [ ] **Step 7: 提交**

```bash
git add web/package.json web/package-lock.json web/nuxt.config.ts web/tsconfig.json web/app.vue web/.gitignore
git commit -m "chore(web): scaffold Nuxt 3 project for rate calculator site"
```

---

## Task 2: `useModelRatio` 纯函数（TDD）

**Files:**
- Create: `web/test/useModelRatio.test.ts`
- Create: `web/composables/useModelRatio.ts`
- Create: `web/vitest.config.ts`

- [ ] **Step 1: 创建 `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: 写失败测试 `web/test/useModelRatio.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  modelRatioToInputPrice,
  inputPriceToModelRatio,
  outputPriceFromCompletionRatio,
  completionRatioFromPrices,
  estimateCostUsd,
} from '../composables/useModelRatio'

describe('模型倍率 ↔ 价格 双向换算', () => {
  it('模型倍率转输入价：倍率1 = $2/1M', () => {
    expect(modelRatioToInputPrice(1)).toBe(2)
    expect(modelRatioToInputPrice(0.5)).toBe(1)
  })

  it('输入价转模型倍率：$2/1M = 倍率1', () => {
    expect(inputPriceToModelRatio(2)).toBe(1)
    expect(inputPriceToModelRatio(10)).toBe(5)
  })

  it('补全倍率 + 输入价 = 输出价', () => {
    expect(outputPriceFromCompletionRatio(10, 3)).toBe(30)
  })

  it('输入价与输出价反推补全倍率', () => {
    expect(completionRatioFromPrices(10, 30)).toBe(3)
  })

  it('输入价为 0 时补全倍率返回 0（避免除零）', () => {
    expect(completionRatioFromPrices(0, 30)).toBe(0)
  })
})

describe('费用估算', () => {
  it('套用 new-api 公式：分组×模型×(输入+输出×补全)/500000', () => {
    // 1 × 0.25 × (3000 + 500×3) / 500000 = 0.00225
    const usd = estimateCostUsd({
      groupRatio: 1,
      modelRatio: 0.25,
      completionRatio: 3,
      inputTokens: 3000,
      outputTokens: 500,
    })
    expect(usd).toBeCloseTo(0.00225, 8)
  })

  it('缺失值按 0 处理，不抛错', () => {
    expect(
      estimateCostUsd({
        groupRatio: 0,
        modelRatio: 0,
        completionRatio: 0,
        inputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd web && npx vitest run test/useModelRatio.test.ts`
Expected: FAIL，报错找不到 `../composables/useModelRatio`。

- [ ] **Step 4: 实现 `web/composables/useModelRatio.ts`**

```ts
// new-api 计费基准：倍率 1 = $2 / 1M tokens（即 $0.002 / 1K）
const USD_PER_1M_AT_RATIO_1 = 2
const QUOTA_DIVISOR = 500000

export function modelRatioToInputPrice(modelRatio: number): number {
  return modelRatio * USD_PER_1M_AT_RATIO_1
}

export function inputPriceToModelRatio(inputPricePer1M: number): number {
  return inputPricePer1M / USD_PER_1M_AT_RATIO_1
}

export function outputPriceFromCompletionRatio(
  inputPricePer1M: number,
  completionRatio: number,
): number {
  return inputPricePer1M * completionRatio
}

export function completionRatioFromPrices(
  inputPricePer1M: number,
  outputPricePer1M: number,
): number {
  if (!inputPricePer1M) return 0
  return outputPricePer1M / inputPricePer1M
}

export interface CostInput {
  groupRatio: number
  modelRatio: number
  completionRatio: number
  inputTokens: number
  outputTokens: number
}

export function estimateCostUsd(input: CostInput): number {
  const { groupRatio, modelRatio, completionRatio, inputTokens, outputTokens } = input
  return (
    (groupRatio * modelRatio * (inputTokens + outputTokens * completionRatio)) /
    QUOTA_DIVISOR
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd web && npx vitest run test/useModelRatio.test.ts`
Expected: PASS，全部用例绿。

- [ ] **Step 6: 提交**

```bash
git add web/vitest.config.ts web/test/useModelRatio.test.ts web/composables/useModelRatio.ts
git commit -m "feat(web): add useModelRatio pure functions with tests"
```

---

## Task 3: `useRechargeRatio` 纯函数（TDD，移植扩展逻辑）

**Files:**
- Create: `web/test/useRechargeRatio.test.ts`
- Create: `web/composables/useRechargeRatio.ts`

参考来源：扩展 `popup.js` `calcRate()`（`payRate = siteRate * discount/10`、`usdPerCny = 1/(exchange*payRate)`、`normalized = exchange*payRate`）。

- [ ] **Step 1: 写失败测试 `web/test/useRechargeRatio.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { calcRecharge } from '../composables/useRechargeRatio'

describe('充值倍率换算', () => {
  it('实付倍率 = 站点倍率 × 折扣/10', () => {
    const r = calcRecharge({ exchange: 7.2, siteRate: 2, discount: 8 })
    // payRate = 2 * 0.8 = 1.6
    expect(r.payRate).toBeCloseTo(1.6, 8)
  })

  it('折算成本字段计算正确', () => {
    const r = calcRecharge({ exchange: 7.2, siteRate: 2, discount: 8 })
    // normalized = exchange * payRate = 7.2 * 1.6 = 11.52
    expect(r.normalizedCny).toBeCloseTo(11.52, 8)
    // usdPerCny = 1 / (exchange * payRate) = 1 / 11.52
    expect(r.usdPerCny).toBeCloseTo(1 / 11.52, 8)
  })

  it('任一输入为 0/空时返回 null（无法计算）', () => {
    expect(calcRecharge({ exchange: 0, siteRate: 2, discount: 8 })).toBeNull()
    expect(calcRecharge({ exchange: 7.2, siteRate: 0, discount: 8 })).toBeNull()
    expect(calcRecharge({ exchange: 7.2, siteRate: 2, discount: 0 })).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx vitest run test/useRechargeRatio.test.ts`
Expected: FAIL，找不到 `../composables/useRechargeRatio`。

- [ ] **Step 3: 实现 `web/composables/useRechargeRatio.ts`**

```ts
export interface RechargeInput {
  exchange: number // 汇率 USD->CNY
  siteRate: number // 站点充值倍率
  discount: number // 折扣（十分制，如 8 表示 8 折）
}

export interface RechargeResult {
  payRate: number // 实付倍率
  usdPerCny: number // 每 1 元人民币折合的美元额度
  normalizedCny: number // 折合：每 1 美元额度对应的人民币
}

export function calcRecharge(input: RechargeInput): RechargeResult | null {
  const { exchange, siteRate, discount } = input
  if (!exchange || !siteRate || !discount) return null
  const payRate = siteRate * (discount / 10)
  const normalizedCny = exchange * payRate
  const usdPerCny = 1 / normalizedCny
  return { payRate, usdPerCny, normalizedCny }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && npx vitest run test/useRechargeRatio.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add web/test/useRechargeRatio.test.ts web/composables/useRechargeRatio.ts
git commit -m "feat(web): add useRechargeRatio pure functions with tests"
```

---

## Task 4: 主流模型预设数据

**Files:**
- Create: `web/data/models.ts`

- [ ] **Step 1: 创建 `web/data/models.ts`**

> 价格单位 $/1M tokens，为参考值（更新日期见 `PRICE_UPDATED_AT`），UI 中标注「以官方为准」。补全倍率由 `输出价 ÷ 输入价` 反推后展示。

```ts
export const PRICE_UPDATED_AT = '2026-06-28'

export interface ModelPreset {
  name: string
  inputPricePer1M: number // 官方输入价 $/1M
  outputPricePer1M: number // 官方输出价 $/1M
}

export const MODEL_PRESETS: ModelPreset[] = [
  { name: 'gpt-4o', inputPricePer1M: 2.5, outputPricePer1M: 10 },
  { name: 'gpt-4o-mini', inputPricePer1M: 0.15, outputPricePer1M: 0.6 },
  { name: 'claude-3-5-sonnet', inputPricePer1M: 3, outputPricePer1M: 15 },
  { name: 'claude-3-opus', inputPricePer1M: 15, outputPricePer1M: 75 },
  { name: 'gemini-1.5-pro', inputPricePer1M: 1.25, outputPricePer1M: 5 },
  { name: 'deepseek-chat', inputPricePer1M: 0.27, outputPricePer1M: 1.1 },
]
```

- [ ] **Step 2: 提交**

```bash
git add web/data/models.ts
git commit -m "feat(web): add model price presets data"
```

---

## Task 5: 模型倍率计算器组件

**Files:**
- Create: `web/components/ModelRatioCalc.vue`

- [ ] **Step 1: 创建 `web/components/ModelRatioCalc.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  modelRatioToInputPrice,
  inputPriceToModelRatio,
  completionRatioFromPrices,
  estimateCostUsd,
} from '../composables/useModelRatio'
import { MODEL_PRESETS, PRICE_UPDATED_AT } from '../data/models'

// 倍率与价格（保留两套输入，任一改动联动另一套）
const modelRatio = ref(1)
const completionRatio = ref(3)
const groupRatio = ref(1)

const inputPrice = computed({
  get: () => modelRatioToInputPrice(modelRatio.value),
  set: (v: number) => { modelRatio.value = inputPriceToModelRatio(v) },
})
const outputPrice = computed(() => inputPrice.value * completionRatio.value)

// 费用估算
const inputTokens = ref(3000)
const outputTokens = ref(500)
const costUsd = computed(() =>
  estimateCostUsd({
    groupRatio: groupRatio.value,
    modelRatio: modelRatio.value,
    completionRatio: completionRatio.value,
    inputTokens: inputTokens.value,
    outputTokens: outputTokens.value,
  }),
)

function applyPreset(name: string) {
  const p = MODEL_PRESETS.find((m) => m.name === name)
  if (!p) return
  modelRatio.value = inputPriceToModelRatio(p.inputPricePer1M)
  completionRatio.value = completionRatioFromPrices(p.inputPricePer1M, p.outputPricePer1M)
}
</script>

<template>
  <section class="calc">
    <h2>模型倍率换算</h2>

    <div class="presets">
      <span>主流模型预设：</span>
      <button v-for="m in MODEL_PRESETS" :key="m.name" type="button" @click="applyPreset(m.name)">
        {{ m.name }}
      </button>
      <small>价格更新于 {{ PRICE_UPDATED_AT }}，以官方为准</small>
    </div>

    <div class="grid">
      <label>模型倍率 <input v-model.number="modelRatio" type="number" step="0.01" min="0"></label>
      <label>输入价 ($/1M) <input v-model.number="inputPrice" type="number" step="0.01" min="0"></label>
      <label>补全倍率 <input v-model.number="completionRatio" type="number" step="0.1" min="0"></label>
      <label>输出价 ($/1M) <output>{{ outputPrice.toFixed(4) }}</output></label>
      <label>分组倍率 <input v-model.number="groupRatio" type="number" step="0.1" min="0"></label>
    </div>

    <h3>费用估算</h3>
    <div class="grid">
      <label>输入 tokens <input v-model.number="inputTokens" type="number" min="0"></label>
      <label>输出 tokens <input v-model.number="outputTokens" type="number" min="0"></label>
      <label>预计花费 ($) <output>{{ costUsd.toFixed(6) }}</output></label>
    </div>
  </section>
</template>

<style scoped>
.calc { max-width: 720px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
input, output { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.presets { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.presets button { cursor: pointer; padding: 4px 10px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add web/components/ModelRatioCalc.vue
git commit -m "feat(web): add ModelRatioCalc component"
```

---

## Task 6: 充值倍率计算器组件

**Files:**
- Create: `web/components/RechargeRatioCalc.vue`

- [ ] **Step 1: 创建 `web/components/RechargeRatioCalc.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { calcRecharge } from '../composables/useRechargeRatio'

const exchange = ref(7.2)
const siteRate = ref(2)
const discount = ref(10)
const syncing = ref(false)
const syncError = ref('')

const result = computed(() =>
  calcRecharge({ exchange: exchange.value, siteRate: siteRate.value, discount: discount.value }),
)

async function syncRate() {
  syncing.value = true
  syncError.value = ''
  try {
    const resp = await fetch('https://api.frankfurter.app/latest?from=USD&to=CNY')
    const data = await resp.json()
    const rate = data?.rates?.CNY
    if (rate) exchange.value = Number(rate.toFixed(4))
    else syncError.value = '同步失败'
  } catch {
    syncError.value = '同步失败'
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <section class="calc">
    <h2>充值倍率换算</h2>
    <div class="grid">
      <label>
        汇率 (USD→CNY)
        <span class="row">
          <input v-model.number="exchange" type="number" step="0.0001" min="0">
          <button type="button" :disabled="syncing" @click="syncRate">{{ syncing ? '...' : '同步' }}</button>
        </span>
      </label>
      <label>站点充值倍率 <input v-model.number="siteRate" type="number" step="0.01" min="0"></label>
      <label>折扣（十分制，如 8 = 8折） <input v-model.number="discount" type="number" step="0.1" min="0" max="10"></label>
    </div>
    <p v-if="syncError" class="err">{{ syncError }}</p>

    <h3>结果</h3>
    <div class="grid" v-if="result">
      <label>实付倍率 <output>x{{ result.payRate.toFixed(4) }}</output></label>
      <label>每 1 元折合美元额度 <output>${{ result.usdPerCny.toFixed(4) }}</output></label>
      <label>每 1 美元额度对应人民币 <output>¥{{ result.normalizedCny.toFixed(4) }}</output></label>
    </div>
    <p v-else class="hint">请填写汇率、站点倍率和折扣</p>
  </section>
</template>

<style scoped>
.calc { max-width: 720px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
.row { display: flex; gap: 6px; }
input, output { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.row input { flex: 1; }
button { cursor: pointer; padding: 6px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; }
.err { color: #ef4444; }
.hint { color: #6b7280; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add web/components/RechargeRatioCalc.vue
git commit -m "feat(web): add RechargeRatioCalc component"
```

---

## Task 7: SEO 长文组件、页面与导航

**Files:**
- Create: `web/components/SeoArticle.vue`
- Modify: `web/app.vue`
- Create: `web/pages/index.vue`
- Create: `web/pages/model-ratio.vue`
- Create: `web/pages/recharge-ratio.vue`

- [ ] **Step 1: 创建 `web/components/SeoArticle.vue`**

```vue
<script setup lang="ts">
defineProps<{ section: 'model' | 'recharge' | 'all' }>()
</script>

<template>
  <article class="article">
    <template v-if="section === 'model' || section === 'all'">
      <h2>模型倍率是什么？怎么算？</h2>
      <p>
        在 New API / One API 中转站里，模型倍率（ModelRatio）决定一个模型的基础计费倍数。
        计费基准是：倍率 1 = $2 / 1M tokens（即 $0.002 / 1K tokens）。
        因此「输入价（$/1M）= 模型倍率 × 2」，反过来「模型倍率 = 输入价 ÷ 2」。
      </p>
      <p>
        补全倍率（CompletionRatio）表示输出价是输入价的几倍，即「补全倍率 = 输出价 ÷ 输入价」。
        分组倍率（GroupRatio）为不同用户组设置差异化倍数。
      </p>
      <p>
        最终费用公式：<code>USD = 分组倍率 × 模型倍率 × (输入tokens + 输出tokens × 补全倍率) ÷ 500000</code>。
      </p>
    </template>

    <template v-if="section === 'recharge' || section === 'all'">
      <h2>充值倍率怎么换算成本？</h2>
      <p>
        中转站的充值倍率 + 折扣决定你实际付出的成本：实付倍率 = 站点倍率 × 折扣 ÷ 10。
        结合美元汇率即可折算出每元人民币能买到多少美元额度，便于横向对比不同中转站的真实价格。
      </p>
    </template>
  </article>
</template>

<style scoped>
.article { max-width: 720px; line-height: 1.7; color: #24292f; margin-top: 32px; }
.article h2 { margin-top: 24px; }
code { background: #f6f8fa; padding: 2px 6px; border-radius: 4px; }
</style>
```

- [ ] **Step 2: 替换 `web/app.vue` 为含导航的布局**

```vue
<template>
  <div class="app">
    <header class="nav">
      <NuxtLink to="/" class="brand">New API 倍率计算器</NuxtLink>
      <nav>
        <NuxtLink to="/model-ratio">模型倍率</NuxtLink>
        <NuxtLink to="/recharge-ratio">充值倍率</NuxtLink>
      </nav>
    </header>
    <main class="main">
      <NuxtPage />
    </main>
    <footer class="footer">
      <p>开源站长工具 · <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener">New API</a></p>
    </footer>
  </div>
</template>

<style>
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #24292f; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; border-bottom: 1px solid #e5e7eb; }
.brand { font-weight: 700; text-decoration: none; color: #111827; }
.nav nav a { margin-left: 16px; text-decoration: none; color: #374151; }
.main { padding: 24px; }
.footer { padding: 24px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
</style>
```

- [ ] **Step 3: 创建 `web/pages/index.vue`**

```vue
<script setup lang="ts">
useSeoMeta({
  title: 'New API 倍率计算器 — 模型倍率 / 充值倍率在线换算',
  description: '免安装在线计算 New API / One API 中转站的模型倍率、补全倍率与充值倍率，支持倍率↔美元价双向换算与费用估算。',
})
</script>

<template>
  <div>
    <h1>New API 倍率计算器</h1>
    <p>面向中转站站长的在线倍率换算工具：模型倍率 ↔ 美元价、充值成本折算，免安装、纯本地计算。</p>
    <ModelRatioCalc />
    <RechargeRatioCalc />
    <SeoArticle section="all" />
  </div>
</template>
```

- [ ] **Step 4: 创建 `web/pages/model-ratio.vue`**

```vue
<script setup lang="ts">
useSeoMeta({
  title: 'New API 模型倍率计算器 — 模型倍率/补全倍率换算美元价',
  description: 'New API / One API 模型倍率、补全倍率、分组倍率在线换算与费用估算。倍率1 = $2/1M tokens，支持主流模型预设一键反推倍率。',
})
</script>

<template>
  <div>
    <h1>New API 模型倍率计算器</h1>
    <ModelRatioCalc />
    <SeoArticle section="model" />
  </div>
</template>
```

- [ ] **Step 5: 创建 `web/pages/recharge-ratio.vue`**

```vue
<script setup lang="ts">
useSeoMeta({
  title: '中转站充值倍率计算器 — 汇率/折扣折算真实成本',
  description: '输入汇率、站点充值倍率与折扣，在线计算中转站实付倍率与每元人民币折合的美元额度，横向对比真实价格。',
})
</script>

<template>
  <div>
    <h1>中转站充值倍率计算器</h1>
    <RechargeRatioCalc />
    <SeoArticle section="recharge" />
  </div>
</template>
```

- [ ] **Step 6: 启动 dev 验证三个路由可渲染、计算联动正常**

Run: `cd web && npm run dev`
Expected: 访问 `http://localhost:3000/`、`/model-ratio`、`/recharge-ratio` 均正常；改模型倍率联动输入价；预设按钮生效；充值结果实时更新。验证后 Ctrl+C 停止。

- [ ] **Step 7: 提交**

```bash
git add web/components/SeoArticle.vue web/app.vue web/pages/
git commit -m "feat(web): add pages, navigation and SEO article"
```

---

## Task 8: SSG 构建与 Cloudflare Pages 部署配置

**Files:**
- Create: `web/public/robots.txt`
- Create: `web/README.md`

- [ ] **Step 1: 创建 `web/public/robots.txt`**

```
User-agent: *
Allow: /
Sitemap: https://example.com/sitemap.xml
```

- [ ] **Step 2: 生成静态站点**

Run: `cd web && npm run generate`
Expected: 成功，输出在 `web/.output/public/`，包含预渲的 `index.html`、`model-ratio/index.html`、`recharge-ratio/index.html` 与 `sitemap.xml`。

- [ ] **Step 3: 验证预渲 HTML 含真实内容（SEO 关键）**

Run: `grep -l "模型倍率" web/.output/public/model-ratio/index.html`
Expected: 命中——证明 H1/文案已 SSG 进静态 HTML，而非空壳。

- [ ] **Step 4: 本地预览静态产物**

Run: `cd web && npx serve .output/public` （或 `npm run preview`）
Expected: 三个页面静态访问正常。验证后停止。

- [ ] **Step 5: 创建 `web/README.md`（部署说明）**

```markdown
# New API 倍率计算器（独立站）

Nuxt 3 + SSG 静态站点，部署到 Cloudflare Pages。

## 本地开发
\`\`\`bash
cd web
npm install
npm run dev      # 开发
npm run test     # 单元测试
npm run generate # 生成静态产物到 .output/public
\`\`\`

## 部署到 Cloudflare Pages
- 方式 A（控制台）：连接仓库，设置
  - Build command: \`cd web && npm install && npm run generate\`
  - Build output directory: \`web/.output/public\`
- 方式 B（CLI）：\`cd web && npm run generate && npx wrangler pages deploy .output/public\`

## 上线前
- 把 \`nuxt.config.ts\` 的 \`site.url\` 与 \`public/robots.txt\` 的 Sitemap 地址改为真实域名。
\`\`\`
```

- [ ] **Step 6: 提交**

```bash
git add web/public/robots.txt web/README.md
git commit -m "chore(web): add robots.txt and Cloudflare Pages deploy docs"
```

---

## Task 9: 全量测试与收尾

- [ ] **Step 1: 跑全部单测**

Run: `cd web && npm run test`
Expected: `useModelRatio` 与 `useRechargeRatio` 全部用例 PASS。

- [ ] **Step 2: 最终生成校验**

Run: `cd web && npm run generate`
Expected: 构建无错误。

- [ ] **Step 3: 更新根 README 增加站点指引（可选小步）**

在仓库根 `README.md` 末尾「项目结构」或新增小节，加一行指向 `web/`：
```markdown
## 独立站（倍率计算器）
在线倍率计算器位于 `web/`（Nuxt 3 + SSG，部署 Cloudflare Pages），详见 `web/README.md`。
```

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: link rate calculator site in root README"
```

---

## Self-Review 记录

- **Spec 覆盖:** ① 架构与部署→Task 1/8；② 两个计算器公式→Task 2/3/5/6；③ SEO 结构(路由/meta/长文/sitemap)→Task 1(sitemap 模块)/7；④ 项目结构→全部；⑤ 测试(Vitest+TDD)→Task 2/3/9。均有对应任务。
- **占位符:** 无 TBD/TODO；所有代码步骤含完整代码。
- **类型一致:** `estimateCostUsd(CostInput)`、`calcRecharge(RechargeInput): RechargeResult|null`、`MODEL_PRESETS/ModelPreset`、`PRICE_UPDATED_AT` 在定义与使用处签名一致。
- **已知占位值:** `site.url`/robots Sitemap 为 `example.com`，Task 8 README 明确要求上线前替换为真实域名。
