<script setup lang="ts">
import { ref, computed } from 'vue'
import { encode } from 'gpt-tokenizer'
import { estimateTokensForModel, costForCall } from '../composables/useTokenCalc'
import { MODEL_PRESETS } from '../data/models'

const text = ref('')
const selectedModel = ref(MODEL_PRESETS[0].name)
const outputTokens = ref(0)

const openaiTokens = computed(() => {
  if (!text.value) return 0
  try {
    return encode(text.value).length
  } catch {
    return 0
  }
})

const charCount = computed(() => text.value.length)
const cjkCount = computed(() => (text.value.match(/[一-鿿]/g) || []).length)

const model = computed(() => MODEL_PRESETS.find((m) => m.name === selectedModel.value) ?? MODEL_PRESETS[0])

const modelTokens = computed(() => estimateTokensForModel(openaiTokens.value, model.value.tokenFactor))

const costUsd = computed(() =>
  costForCall({
    inputTokens: modelTokens.value,
    outputTokens: outputTokens.value,
    inputPricePer1M: model.value.inputPricePer1M,
    outputPricePer1M: model.value.outputPricePer1M,
  }),
)

const isOpenAI = computed(() => model.value.provider === 'OpenAI')

function fmt(n: number, digits: number): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}
</script>

<template>
  <section class="calc">
    <h2>Token 计算器</h2>

    <textarea
      v-model="text"
      class="input"
      rows="6"
      placeholder="粘贴 prompt 或对话文本……"
    />

    <div class="stats">
      <span>字符数：<b>{{ charCount }}</b></span>
      <span>汉字数：<b>{{ cjkCount }}</b></span>
      <span>Token（OpenAI 精确）：<b>{{ openaiTokens }}</b></span>
    </div>

    <div class="grid">
      <label>
        模型
        <select v-model="selectedModel">
          <option v-for="m in MODEL_PRESETS" :key="m.name" :value="m.name">{{ m.name }}</option>
        </select>
      </label>
      <label>该模型估算 token <output>{{ modelTokens }}</output></label>
      <label>输出 tokens <input v-model.number="outputTokens" type="number" min="0"></label>
      <label>单次费用 ($) <output>{{ fmt(costUsd, 6) }}</output></label>
    </div>

    <p class="note">
      OpenAI 系为精确计数；{{ isOpenAI ? '' : '当前模型为估算（误差约 5%），' }}以官方为准。
    </p>
  </section>
</template>

<style scoped>
.calc { max-width: 720px; }
.input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #d0d7de; border-radius: 8px; font-family: ui-monospace, 'SF Mono', Monaco, monospace; font-size: 13px; resize: vertical; }
.stats { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; font-size: 14px; color: #4b5563; }
.stats b { color: #111827; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
input, output, select { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
output { background: #f6f8fa; }
.note { margin-top: 12px; font-size: 13px; color: #6b7280; }
</style>
