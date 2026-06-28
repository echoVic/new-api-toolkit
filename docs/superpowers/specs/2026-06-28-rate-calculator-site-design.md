# 倍率计算器独立站 — 设计文档

- 日期：2026-06-28
- 状态：已获批，待生成实现计划
- 关联项目：new-api-toolkit（站长工具 Chrome 扩展）

## 1. 背景与目标

`new-api-toolkit` 目前是一个面向 **New API 中转站站长** 的 Chrome 扩展。经需求 + SEO 分析后确认：扩展的多数功能（日志导出、监控）依赖注入面板 DOM 与复用登录态，无法脱离扩展；但**倍率计算**是纯客户端运算、无需登录态，适合抽成独立网页，且 SEO 需求已被社区（如 onecalc.atlassc.net、LINUX DO 倍率计算器帖）验证为低竞争长尾蓝海。

本项目：用 Vue 生态做一个**倍率计算器独立站**，部署到 Cloudflare，主攻 SEO 自然流量，并反哺扩展安装。

**首发范围**：倍率计算器单页（含两个计算器）。压测在线版为后续迭代，不在本次范围。

## 2. 决策记录

| 项 | 决策 | 理由 |
|---|---|---|
| 首发工具 | 倍率计算器（模型倍率 + 充值倍率两者都做） | SEO 确定性最高、零后端、零滥用风险 |
| 技术形态 | Nuxt 3 + SSG（静态生成） | Vue 生态 + 预渲真 HTML，SEO 最佳；易扩展 |
| 代码位置 | 本仓库新建 `web/` 子目录 | 扩展与站点同仓，共享品牌，一处维护 |
| 部署 | `nuxt generate` 纯静态 → Cloudflare Pages | 零后端、零成本 |
| 语言 | 先中文；代码 i18n-ready，不先做英文 | 受众是中文站长（YAGNI） |

## 3. 架构与部署

- **Nuxt 3**，`ssr: true` + `nuxt generate` → 输出纯静态 HTML 到 `.output/public`，部署 Cloudflare Pages。
- 不用 `@nuxt/content`（过重）；SEO 元信息用内置 `useSeoMeta` / `useHead`。
- 计算逻辑全部客户端 `<script setup>`；页面骨架与说明文案 SSG 预渲为 HTML（SEO 拿内容，交互靠 hydration）。
- **无后端、无数据库、不存储任何 API Key**。
- 汇率同步：客户端 `fetch('https://api.frankfurter.app/latest?from=USD&to=CNY')`（frankfurter 支持 CORS）。

## 4. 计算器功能与公式

### Tab 1 · 模型倍率换算（SEO 主打）

计费基准：`倍率 1 = $2 / 1M tokens`（即 $0.002 / 1K tokens）。

双向换算：

- `输入价($/1M) = 模型倍率 × 2` ⟺ `模型倍率 = 输入价 ÷ 2`
- `输出价($/1M) = 输入价 × 补全倍率` ⟺ `补全倍率 = 输出价 ÷ 输入价`

费用估算：

```
USD = 分组倍率 × 模型倍率 × (输入tokens + 输出tokens × 补全倍率) ÷ 500000
```

- **主流模型预设表**：内置 GPT / Claude / Gemini / DeepSeek 官方价（标注更新日期、字段可编辑），一键反推倍率。预设价仅作参考，明确标注「价格随官方调整，请以官方为准」。
- 进阶（可折叠）：缓存倍率、音频倍率（New API 新公式字段），默认隐藏。

### Tab 2 · 充值倍率换算（移植现有扩展逻辑）

输入：汇率（USD→CNY）、站点充值倍率、折扣。

```
实付倍率 = 站点倍率 × (折扣 ÷ 10)
```

输出：实付倍率、折合成本（$/¥）。**汇率一键同步**（frankfurter）。

> 移植自 `popup.js` 现有 `calcRate()` 逻辑，保持口径一致。

## 5. SEO 结构

- 路由：
  - `/` — 着陆页 + 双计算器入口
  - `/model-ratio` — 模型倍率计算器（独立着陆页，承接长尾）
  - `/recharge-ratio` — 充值倍率计算器
- 每页 `useSeoMeta`：title / description / OG；主关键词进 `<h1>`。
- 页内嵌「倍率是什么 + 公式说明」长文，给 Google 内容权重并承接长尾。
- `@nuxtjs/sitemap` 自动生成 `sitemap.xml` + `robots.txt`。
- 目标关键词：`new-api 倍率计算器`、`one-api 倍率换算`、`模型倍率/补全倍率 计算`、`中转站 充值倍率`。

## 6. 项目结构

```
web/
├── nuxt.config.ts           # SSG + sitemap + seo 配置
├── app.vue
├── pages/
│   ├── index.vue            # 着陆 + 双计算器
│   ├── model-ratio.vue      # 模型倍率独立页
│   └── recharge-ratio.vue   # 充值倍率独立页
├── components/
│   ├── ModelRatioCalc.vue   # 模型倍率 UI
│   ├── RechargeRatioCalc.vue# 充值倍率 UI
│   └── SeoArticle.vue       # 公式说明长文（可复用）
├── composables/
│   ├── useModelRatio.ts     # 纯函数：倍率↔价、费用估算
│   └── useRechargeRatio.ts  # 纯函数：充值换算
└── data/models.ts           # 主流模型预设价（含更新日期）
```

**隔离原则**：纯计算逻辑抽到 `composables/`（无 DOM 依赖，可独立单测）；组件只管 UI 与输入绑定；预设数据集中在 `data/models.ts`。

## 7. 测试

- **Vitest** 对 `useModelRatio` / `useRechargeRatio` 做单元测试：
  - 倍率 ↔ 价格双向换算
  - 费用估算公式
  - 边界：0、空值、非法输入
- 采用 **TDD**：先写公式测试再实现（逻辑是数学，最适合测试先行）。
- UI 不强制测试（YAGNI）：手动验证 + Cloudflare Pages 部署预览。

## 8. 非目标（YAGNI）

- 在线压测工具（后续迭代）
- 英文/多语言
- 后端、账号、数据持久化
- 文档站 / 博客系统
