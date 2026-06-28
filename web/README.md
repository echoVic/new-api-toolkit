# New API 倍率计算器（独立站）

Nuxt 3 + SSG 静态站点，部署到 Cloudflare Pages。

## 本地开发
```bash
cd web
npm install
npm run dev      # 开发
npm run test     # 单元测试
npm run generate # 生成静态产物到 .output/public
```

## 部署到 Cloudflare Pages
- 方式 A（控制台）：连接仓库，设置
  - Build command: `cd web && npm install && npm run generate`
  - Build output directory: `web/.output/public`
- 方式 B（CLI）：`cd web && npm run generate && npx wrangler pages deploy .output/public`

## 上线前
- 把 `nuxt.config.ts` 的 `site.url` 与 `public/robots.txt` 的 Sitemap 地址改为真实域名。

## 价格数据

模型价格来自开源数据库 [models.dev](https://models.dev/)（MIT），构建时由 `scripts/fetch-prices.mjs` 自动拉取 `https://models.dev/api.json`，按 provider 白名单筛选生成 `data/models.generated.ts`（不入仓）。

- 拉取失败时自动回退到 `data/models.fallback.ts`（入仓的真实快照），构建不中断。
- 手动刷新：`cd web && node scripts/fetch-prices.mjs`
- 调整收录范围：编辑 `scripts/fetch-prices.mjs` 顶部的 `PROVIDER_WHITELIST`。
