<script setup lang="ts">
useSeoMeta({
  title: 'Token 计算器 — 大模型 API token 数与费用在线估算',
  description: '粘贴文本在线计算 token 数与单次调用费用。OpenAI 精确分词，Claude/Gemini/DeepSeek 校准估算，支持中英文。',
})
</script>

<template>
  <div>
    <h1>Token 计算器</h1>
    <p>粘贴 prompt 或对话文本，实时计算 token 数与单次调用费用。OpenAI 系为精确计数，其余模型按校准系数估算。</p>
    <TokenCalc />
    <article class="article">
      <h2>Token 是什么？怎么算费用？</h2>
      <p>
        大模型按 token 计费，不是按字数。英文约 1 token ≈ 4 字符 ≈ 0.75 个单词；
        中文通常 1 字 ≈ 1～2 token，生僻字更多。不同模型用不同分词器，同一段文本 token 数会有差异。
      </p>
      <p>
        单次调用费用 = (输入 token × 输入单价 + 输出 token × 输出单价) ÷ 1,000,000（单位：美元）。
        本工具对 OpenAI 模型用官方 o200k 分词器精确计数，其余模型基于校准系数估算（误差约 5%），以官方为准。
      </p>
    </article>
  </div>
</template>

<style scoped>
.article { max-width: 720px; line-height: 1.7; color: #24292f; margin-top: 32px; }
.article h2 { margin-top: 24px; }
</style>
