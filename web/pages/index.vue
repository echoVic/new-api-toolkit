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
