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
