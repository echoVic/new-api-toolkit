<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  modelRatioToInputPrice,
  inputPriceToModelRatio,
  completionRatioFromPrices,
  outputPriceFromCompletionRatio,
  estimateCostUsd,
} from '../composables/useModelRatio'
import { MODEL_PRESETS, PRICE_UPDATED_AT } from '../data/models'

const modelRatio = ref(1)
const completionRatio = ref(3)
const groupRatio = ref(1)

const inputPrice = computed({
  get: () => modelRatioToInputPrice(modelRatio.value),
  set: (v: number) => { modelRatio.value = inputPriceToModelRatio(v) },
})
const outputPrice = computed(() => outputPriceFromCompletionRatio(inputPrice.value, completionRatio.value))

const inputTokens = ref(3000)
const outputTokens = ref(500)
const costUsd = computed(() =>
  estimateCostUsd({
    groupRatio: groupRatio.value,
    modelRatio: modelRatio.value,
    completionRatio: completionRatio.value,
    inputTokens: inputTokens.value,
    outputTokens: outputTokens.value,
  }),
)

function applyPreset(name: string) {
  const p = MODEL_PRESETS.find((m) => m.name === name)
  if (!p) return
  modelRatio.value = inputPriceToModelRatio(p.inputPricePer1M)
  completionRatio.value = completionRatioFromPrices(p.inputPricePer1M, p.outputPricePer1M)
}
</script>

<template>
  <section class="calc">
    <h2>模型倍率换算</h2>

    <div class="presets">
      <span>主流模型预设：</span>
      <button v-for="m in MODEL_PRESETS" :key="m.name" type="button" @click="applyPreset(m.name)">
        {{ m.name }}
      </button>
      <small>价格更新于 {{ PRICE_UPDATED_AT }}，以官方为准</small>
    </div>

    <div class="grid">
      <label>模型倍率 <input v-model.number="modelRatio" type="number" step="0.01" min="0"></label>
      <label>输入价 ($/1M) <input v-model.number="inputPrice" type="number" step="0.01" min="0"></label>
      <label>补全倍率 <input v-model.number="completionRatio" type="number" step="0.1" min="0"></label>
      <label>输出价 ($/1M) <output>{{ outputPrice.toFixed(4) }}</output></label>
      <label>分组倍率 <input v-model.number="groupRatio" type="number" step="0.1" min="0"></label>
    </div>

    <h3>费用估算</h3>
    <div class="grid">
      <label>输入 tokens <input v-model.number="inputTokens" type="number" min="0"></label>
      <label>输出 tokens <input v-model.number="outputTokens" type="number" min="0"></label>
      <label>预计花费 ($) <output>{{ costUsd.toFixed(6) }}</output></label>
    </div>
  </section>
</template>

<style scoped>
.calc { max-width: 720px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
input, output { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.presets { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.presets button { cursor: pointer; padding: 4px 10px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; }
</style>
