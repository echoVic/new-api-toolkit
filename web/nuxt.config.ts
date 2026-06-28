// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-06-28',
  ssr: true,
  modules: ['@nuxtjs/sitemap'],
  site: {
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
