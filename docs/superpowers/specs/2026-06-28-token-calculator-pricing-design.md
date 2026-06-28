# Token 计算器 + 价格对比 设计文档

- 日期：2026-06-28
- 状态：已获批，待生成实现计划
- 所属项目：new-api-toolkit / `web/` 独立站

## 1. 背景与目标

`web/` 独立站已有倍率计算器、充值换算、API 压测三个工具。经站长需求调研，**Token 计算器**与**模型价格对比**是与现有倍率工具最互补、SEO 最稳的下一步：把站点从"倍率工具"升级为"中转站定价决策中心"。

本项目新增两个独立工具页：

- **Token 计算器** `/token-calculator`：粘贴文本 → token 数 + 单次调用费用估算
- **价格对比表** `/pricing`：主流模型输入/输出/缓存价、上下文、New API 倍率的横向可排序对比

## 2. 决策记录

| 项 | 决策 | 理由 |
|---|---|---|
| Token 精度 | 混合：OpenAI 系用 `gpt-tokenizer`(o200k_base) 精确；其他模型按系数估算 | 业界主流做法(devtk/302.AI)，纯前端、无需联网/key |
| 两工具关系 | 两个独立路由页，共用 `data/models.ts` 价格数据 | SEO 面最宽，各自承接长尾 |
| 价格表字段 | 丰富字段 + 倍率列 | 对站长最实用，倍率列复用已有换算函数 |
| 部署形态 | 纯前端 SSG，价格为手维护快照 | YAGNI；Worker 自动更价为后续加分项 |
| tokenizer 库 | `gpt-tokenizer` | 纯 JS、o200k_base、API 简单 |

## 3. 架构

- 沿用 Nuxt 3 + SSG。新增两路由：`/token-calculator`、`/pricing`，并加入 `nuxt.config.ts` 的 `nitro.prerender.routes`。
- `gpt-tokenizer` 仅在 Token 计算器组件**客户端**调用（不在 SSG 阶段执行，避免把分词器打入每个页面 chunk）。
- 价格对比为纯静态数据，SSG 直接预渲成表格 HTML（SEO 友好）。
- 纯计算/估算逻辑抽到 `composables/`，可单测。
- 无后端。

## 4. 数据层（扩展 `data/models.ts`）

在现有 `ModelPreset`(name/inputPricePer1M/outputPricePer1M) 基础上**新增可选字段**，保证现有计算器不受影响（只多读、不强制）：

```ts
export interface ModelPreset {
  name: string
  inputPricePer1M: number
  outputPricePer1M: number
  provider?: string              // 厂商分组，如 'OpenAI' / 'Anthropic' / 'Google' / 'DeepSeek'
  contextTokens?: number         // 上下文窗口
  cachedInputPricePer1M?: number // 缓存输入价（可选）
  tokenFactor?: number           // 相对 OpenAI tokenizer 的 token 估算系数，缺省 1
}
```

现有 7 个模型补全 `provider` / `contextTokens` / `tokenFactor`（`cachedInputPricePer1M` 按已知填，未知留空）。

## 5. Token 计算器（`/token-calculator`）

### 功能
- 大文本框：粘贴 prompt / 对话。
- 实时显示：**token 数**（`gpt-tokenizer` 精确）、字符数、≈汉字数。
- 选模型（来自 `MODEL_PRESETS`）→ 按该模型 `tokenFactor` 估算其 token 数。
- 费用估算：分别填**输入 token**与**输出 token**（输入默认取上面算出的 token 数，输出可手填），按所选模型单价算单次调用费用。
- 明确标注："OpenAI 系为精确计数，其余为估算（误差约 5%），以官方为准。"

### 纯函数（`composables/useTokenCalc.ts`）
```ts
// 按模型系数估算 token（openaiTokens 为 gpt-tokenizer 精确值）
estimateTokensForModel(openaiTokens: number, factor?: number): number
// 单次调用费用（美元）
costForCall(input: {
  inputTokens: number
  outputTokens: number
  inputPricePer1M: number
  outputPricePer1M: number
}): number
```
公式：`cost = (inputTokens × inputPrice + outputTokens × outputPrice) / 1_000_000`。
`estimateTokensForModel = Math.round(openaiTokens × (factor ?? 1))`。

### 组件
- `components/TokenCalc.vue`：文本输入 + tokenizer 调用 + 模型选择 + 费用展示。
- tokenizer 的 `encode()` 仅在客户端 `onMounted` 后或输入事件中调用。
- 空输入 / NaN 兜底显示 `—`（沿用现有 `fmt` 模式）。

## 6. 价格对比表（`/pricing`）

### 功能
- 可排序表格，列：厂商 | 模型 | 输入价 $/1M | 输出价 $/1M | 缓存价 | 上下文 | 模型倍率 ≈。
- 点表头按 输入价 / 输出价 / 上下文 排序（升降序切换）。
- 顶部单位切换：`$/1M` ⇄ `New API 倍率`（复用 `inputPriceToModelRatio` / 补全倍率 `completionRatioFromPrices`）。
- 标注更新日期 + "以官方为准"。

### 组件
- `components/PricingTable.vue`：读取 `MODEL_PRESETS`，渲染表格、处理排序与单位切换。
- 排序为纯客户端 `computed`，无副作用。

## 7. 着陆页与导航

- `pages/index.vue`：卡片增加 2 张（Token 计算器、价格对比）。
- `layouts/default.vue`：导航增加 2 个入口（Token 计算 / 价格对比）。
- `nuxt.config.ts`：`nitro.prerender.routes` 增加两路由；sitemap 自动包含。
- 每页 `useSeoMeta` 设独立 title/description。

## 8. SEO

- 目标词：`token 计算器`、`tokenizer 在线`、`大模型 API 费用估算`、`大模型 API 价格对比`、`claude gpt gemini 价格`、`模型上下文长度对比`。
- 价格表内容 SSG 预渲成 HTML（表格文本进静态页）；Token 计算器页配说明长文（token 是什么、中英文 token 差异、估算说明）。

## 9. 测试

- **Vitest** 测纯函数：
  - `estimateTokensForModel`（系数缺省=1、四舍五入、0 输入）
  - `costForCall`（公式、0 值、仅输入/仅输出）
  - 价格⇄倍率换算复用已测 `useModelRatio` 函数（不重复测）
- tokenizer 本身不测（信赖 `gpt-tokenizer`）；测我们包装的估算/费用函数。
- TDD：先写费用/估算测试再实现。
- UI 不强制测试（YAGNI）：`npm run generate` 预渲校验 + 手动验证。

## 10. 文件结构（新增/修改）

```
web/
├── data/models.ts              # 修改：ModelPreset 加可选字段 + 补全数据
├── composables/
│   └── useTokenCalc.ts         # 新增：estimateTokensForModel / costForCall
├── components/
│   ├── TokenCalc.vue           # 新增
│   └── PricingTable.vue        # 新增
├── pages/
│   ├── token-calculator.vue    # 新增
│   ├── pricing.vue             # 新增
│   └── index.vue               # 修改：加 2 张卡片
├── layouts/default.vue         # 修改：加 2 个导航入口
├── nuxt.config.ts              # 修改：prerender routes
├── test/useTokenCalc.test.ts   # 新增
└── package.json                # 修改：加 gpt-tokenizer 依赖
```

## 11. 非目标（YAGNI）

- Worker 自动抓取/更新价格（后续）
- 各厂商官方 count_tokens 精确计数（与"免安装快速估算"初衷冲突）
- 多语言 / 历史价格走势 / 缓存命中率建模
