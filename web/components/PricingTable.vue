<script setup lang="ts">
import { ref, computed } from 'vue'
import { MODEL_PRESETS, PRICE_UPDATED_AT } from '../data/models'
import { inputPriceToModelRatio, completionRatioFromPrices } from '../composables/useModelRatio'

type SortKey = 'inputPricePer1M' | 'outputPricePer1M' | 'contextTokens'
const sortKey = ref<SortKey>('inputPricePer1M')
const sortAsc = ref(true)
const unit = ref<'usd' | 'ratio'>('usd')

function setSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = true
  }
}

const rows = computed(() => {
  const list = [...MODEL_PRESETS]
  list.sort((a, b) => {
    const av = a[sortKey.value] ?? 0
    const bv = b[sortKey.value] ?? 0
    return sortAsc.value ? av - bv : bv - av
  })
  return list
})

function ctxLabel(n?: number): string {
  if (!n) return '—'
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)
}
function fmtUsd(n?: number): string {
  return n === undefined ? '—' : `$${n}`
}
</script>

<template>
  <section class="pricing">
    <div class="toolbar">
      <span>单位：</span>
      <button :class="{ active: unit === 'usd' }" type="button" @click="unit = 'usd'">$/1M</button>
      <button :class="{ active: unit === 'ratio' }" type="button" @click="unit = 'ratio'">New API 倍率</button>
      <small>价格更新于 {{ PRICE_UPDATED_AT }}，以官方为准</small>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>厂商</th>
            <th>模型</th>
            <th class="sortable" @click="setSort('inputPricePer1M')">
              输入 {{ unit === 'usd' ? '($/1M)' : '(倍率)' }}
              <span v-if="sortKey === 'inputPricePer1M'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="setSort('outputPricePer1M')">
              输出 {{ unit === 'usd' ? '($/1M)' : '(补全倍率)' }}
              <span v-if="sortKey === 'outputPricePer1M'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
            <th>缓存输入 ($/1M)</th>
            <th class="sortable" @click="setSort('contextTokens')">
              上下文
              <span v-if="sortKey === 'contextTokens'">{{ sortAsc ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in rows" :key="m.name">
            <td>{{ m.provider ?? '—' }}</td>
            <td class="model">{{ m.name }}</td>
            <td v-if="unit === 'usd'">${{ m.inputPricePer1M }}</td>
            <td v-else>x{{ inputPriceToModelRatio(m.inputPricePer1M) }}</td>
            <td v-if="unit === 'usd'">${{ m.outputPricePer1M }}</td>
            <td v-else>x{{ completionRatioFromPrices(m.inputPricePer1M, m.outputPricePer1M).toFixed(2) }}</td>
            <td>{{ fmtUsd(m.cachedInputPricePer1M) }}</td>
            <td>{{ ctxLabel(m.contextTokens) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.pricing { max-width: 820px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; font-size: 14px; }
.toolbar button { cursor: pointer; padding: 4px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; font-size: 13px; }
.toolbar button.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
.toolbar small { color: #6b7280; margin-left: auto; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
th { background: #fafbfc; font-weight: 600; }
.sortable { cursor: pointer; user-select: none; }
.sortable:hover { background: #f0f3f6; }
.model { font-family: ui-monospace, 'SF Mono', Monaco, monospace; font-size: 13px; }
</style>
