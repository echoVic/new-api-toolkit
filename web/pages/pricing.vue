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
