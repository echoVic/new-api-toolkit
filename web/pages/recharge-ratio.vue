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
