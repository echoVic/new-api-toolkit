<script setup lang="ts">
useSeoMeta({
  title: 'New API 工具箱 — 倍率计算器 / 充值换算 / API 压测',
  description: '面向 New API / One API 中转站站长的免安装在线工具集：模型倍率换算、充值倍率成本折算、API 并发压测，纯本地运行。',
})

const tools = [
  {
    to: '/model-ratio',
    title: '模型倍率换算',
    desc: '模型倍率 ⇄ 美元价双向换算，含补全/分组倍率与费用估算，主流模型预设一键反推。',
  },
  {
    to: '/recharge-ratio',
    title: '充值倍率换算',
    desc: '汇率 × 站点倍率 × 折扣，折算中转站真实充值成本，横向对比各站价格。',
  },
  {
    to: '/benchmark',
    title: 'API 压测',
    desc: '对中转站 API 发起并发请求，测量延迟百分位、TTFT/TPS、RPM/TPM 等性能指标。',
  },
]
</script>

<template>
  <div>
    <h1>New API 工具箱</h1>
    <p class="lead">面向中转站站长的在线工具集：倍率换算、充值成本折算、API 并发压测，免安装、纯本地计算。</p>

    <div class="cards">
      <NuxtLink v-for="t in tools" :key="t.to" :to="t.to" class="card">
        <h2>{{ t.title }}</h2>
        <p>{{ t.desc }}</p>
        <span class="go">打开 →</span>
      </NuxtLink>
    </div>

    <SeoArticle section="all" />
  </div>
</template>

<style scoped>
.lead { color: #4b5563; max-width: 640px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin: 24px 0; }
.card {
  display: block;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.card:hover { border-color: #3b82f6; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
.card h2 { margin: 0 0 8px; font-size: 17px; }
.card p { margin: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.6; }
.card .go { font-size: 14px; color: #2563eb; font-weight: 500; }
</style>
