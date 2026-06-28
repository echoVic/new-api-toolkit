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
