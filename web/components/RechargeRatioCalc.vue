<script setup lang="ts">
import { ref, computed } from 'vue'
import { calcRecharge } from '../composables/useRechargeRatio'

const exchange = ref(7.2)
const siteRate = ref(2)
const discount = ref(10)
const syncing = ref(false)
const syncError = ref('')

const result = computed(() =>
  calcRecharge({ exchange: exchange.value, siteRate: siteRate.value, discount: discount.value }),
)

async function syncRate() {
  syncing.value = true
  syncError.value = ''
  try {
    const resp = await fetch('https://api.frankfurter.app/latest?from=USD&to=CNY')
    if (!resp.ok) {
      syncError.value = '同步失败'
      return
    }
    const data = await resp.json()
    const rate = data?.rates?.CNY
    if (rate) exchange.value = Number(rate.toFixed(4))
    else syncError.value = '同步失败'
  } catch {
    syncError.value = '同步失败'
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <section class="calc">
    <h2>充值倍率换算</h2>
    <div class="grid">
      <label>
        汇率 (USD→CNY)
        <span class="row">
          <input v-model.number="exchange" type="number" step="0.0001" min="0">
          <button type="button" :disabled="syncing" @click="syncRate">{{ syncing ? '...' : '同步' }}</button>
        </span>
      </label>
      <label>站点充值倍率 <input v-model.number="siteRate" type="number" step="0.01" min="0"></label>
      <label>折扣（十分制，如 8 = 8折） <input v-model.number="discount" type="number" step="0.1" min="0" max="10"></label>
    </div>
    <p v-if="syncError" class="err">{{ syncError }}</p>

    <h3>结果</h3>
    <div class="grid" v-if="result">
      <label>实付倍率 <output>x{{ result.payRate.toFixed(4) }}</output></label>
      <label>每 1 元折合美元额度 <output>${{ result.usdPerCny.toFixed(4) }}</output></label>
      <label>每 1 美元额度对应人民币 <output>¥{{ result.normalizedCny.toFixed(4) }}</output></label>
    </div>
    <p v-else class="hint">请填写汇率、站点倍率和折扣</p>
  </section>
</template>

<style scoped>
.calc { max-width: 720px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
.row { display: flex; gap: 6px; }
input, output { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.row input { flex: 1; }
button { cursor: pointer; padding: 6px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; }
.err { color: #ef4444; }
.hint { color: #6b7280; }
</style>
