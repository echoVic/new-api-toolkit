<script setup lang="ts">
import { ref, reactive, shallowRef, computed } from 'vue'
import { runBenchmark } from '../composables/useBenchmark'
import { MODEL_PRESETS } from '../data/models'
import type { BenchResult, BenchProgress, BenchConfig } from '../composables/useBenchmark'

const baseURL = ref('')
const apiKey = ref('')
const model = ref('gpt-5.5')
const concurrency = ref(5)
const totalRequests = ref(20)
const apiFormat = ref<'openai' | 'anthropic'>('openai')
const stream = ref(true)
const prompt = ref('')
const maxTokens = ref(50)

const running = ref(false)
const finished = ref(false)
const progress = reactive<BenchProgress>({
  completed: 0,
  succeeded: 0,
  failed: 0,
  total: 0,
  elapsedMs: 0,
})
const result = shallowRef<BenchResult | null>(null)
const errorMessage = ref('')
const aborted = ref(false)
const showAdvanced = ref(false)

let abortController: AbortController | null = null

function applyPreset(modelName: string) {
  model.value = modelName
}

async function startBenchmark() {
  if (!baseURL.value || !apiKey.value || !model.value) {
    errorMessage.value = '请填写 API 地址、密钥和模型名称'
    return
  }

  errorMessage.value = ''
  running.value = true
  finished.value = false
  aborted.value = false
  result.value = null
  progress.completed = 0
  progress.succeeded = 0
  progress.failed = 0
  progress.total = 0
  progress.elapsedMs = 0

  abortController = new AbortController()

  const config: BenchConfig = {
    baseURL: baseURL.value,
    apiKey: apiKey.value,
    model: model.value,
    concurrency: concurrency.value,
    totalRequests: totalRequests.value,
    apiFormat: apiFormat.value,
    stream: stream.value,
    prompt: prompt.value,
    maxTokens: maxTokens.value,
  }

  try {
    const res = await runBenchmark(config, abortController.signal, (p) => {
      progress.completed = p.completed
      progress.succeeded = p.succeeded
      progress.failed = p.failed
      progress.total = p.total
      progress.elapsedMs = p.elapsedMs
    })
    result.value = res
    finished.value = true
    if (aborted.value) errorMessage.value = '压测已终止（以下为部分结果）'
  } catch (err: unknown) {
    errorMessage.value = (err as Error).message || '压测失败'
    finished.value = true
  } finally {
    running.value = false
    abortController = null
  }
}

function abortBenchmark() {
  if (abortController) {
    aborted.value = true
    abortController.abort()
  }
}

const progressPercent = computed(() =>
  progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
)

const elapsedSeconds = computed(() => (progress.elapsedMs / 1000).toFixed(1))
</script>

<template>
  <section class="calc">
    <h2>API 压测</h2>

    <div class="grid">
      <label>
        API 地址
        <input v-model="baseURL" type="text" placeholder="https://api.example.com">
      </label>
      <label>
        API Key
        <input v-model="apiKey" type="password" placeholder="sk-...">
      </label>
    </div>

    <div class="presets">
      <span>模型预设：</span>
      <button
        v-for="m in MODEL_PRESETS"
        :key="m.name"
        type="button"
        :class="{ active: model === m.name }"
        @click="applyPreset(m.name)"
      >
        {{ m.name }}
      </button>
      <input
        v-model="model"
        type="text"
        placeholder="自定义模型"
        class="model-input"
      >
    </div>

    <div class="grid">
      <label>
        接口格式
        <select v-model="apiFormat">
          <option value="openai">OpenAI 兼容</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label>
        并发数
        <input v-model.number="concurrency" type="number" min="1" max="200">
      </label>
      <label>
        总请求数
        <input v-model.number="totalRequests" type="number" min="1" max="5000">
      </label>
      <label class="checkbox-label">
        流式请求
        <label class="toggle-row">
          <input v-model="stream" type="checkbox">
          <span>启用（可测量 TTFT / TPS）</span>
        </label>
      </label>
    </div>

    <details :open="showAdvanced" @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open" class="advanced">
      <summary>高级设置</summary>
      <div class="grid">
        <label>
          max_tokens
          <input v-model.number="maxTokens" type="number" min="1" max="4096">
        </label>
        <label class="span-2">
          自定义 Prompt
          <textarea v-model="prompt" rows="2" placeholder="留空使用默认: Say hi in one word." />
        </label>
      </div>
    </details>

    <div class="actions">
      <button type="button" class="btn-primary" :disabled="running" @click="startBenchmark">
        {{ running ? '运行中...' : '开始压测' }}
      </button>
      <button type="button" class="btn-danger" :disabled="!running" @click="abortBenchmark">
        终止
      </button>
    </div>

    <div v-if="running || finished" class="progress-section">
      <div class="progress-header">
        <span>{{ progress.completed }} / {{ progress.total }}</span>
        <span>{{ elapsedSeconds }}s</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
    </div>

    <p v-if="errorMessage" class="err">{{ errorMessage }}</p>

    <template v-if="result">
      <h3>压测报告</h3>
      <div class="grid results">
        <label>成功 <output>{{ result.success }}</output></label>
        <label>失败 <output>{{ result.errors }}</output></label>
        <label>成功率 <output>{{ result.successRate }}%</output></label>
        <label>平均延迟 <output>{{ result.avgLatencyMs }}ms</output></label>
        <label>P50 <output>{{ result.p50Ms }}ms</output></label>
        <label>P90 <output>{{ result.p90Ms }}ms</output></label>
        <label>P99 <output>{{ result.p99Ms }}ms</output></label>
        <label>RPM <output>{{ result.rpm }}</output></label>
        <label>TPM <output>{{ result.tpm }}</output></label>
        <label>总 Token <output>{{ result.totalTokens }}</output></label>
        <label>总耗时 <output>{{ (result.totalDurationMs / 1000).toFixed(1) }}s</output></label>
        <template v-if="result.avgTtftMs !== undefined">
          <label>平均 TTFT <output>{{ result.avgTtftMs }}ms</output></label>
          <label>P90 TTFT <output>{{ result.p90TtftMs }}ms</output></label>
          <label>平均 TPS <output>{{ result.avgTps?.toFixed(1) }}</output></label>
          <label>中位 TPS <output>{{ result.p50Tps?.toFixed(1) }}</output></label>
        </template>
      </div>

      <div v-if="result.errorDetails?.length" class="error-details">
        <h4>错误明细</h4>
        <div v-for="e in result.errorDetails" :key="e.message" class="error-row">
          {{ e.message }} <b>x{{ e.count }}</b>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.calc { max-width: 800px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; font-size: 14px; gap: 4px; }
input, output, select, textarea { padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 14px; }
textarea { resize: vertical; font-family: ui-monospace, 'SF Mono', Monaco, monospace; }
output { background: #f6f8fa; }
.checkbox-label { flex-direction: column; }
.toggle-row { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #666; }
.toggle-row input { margin: 0; }
.span-2 { grid-column: span 2; }

.presets { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.presets button {
  cursor: pointer;
  padding: 4px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f6f8fa;
  font-size: 13px;
}
.presets button.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
.model-input { flex: 1; min-width: 150px; padding: 4px 8px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 13px; }

.advanced { margin: 12px 0; font-size: 13px; }
.advanced summary { cursor: pointer; color: #666; user-select: none; padding: 4px 0; }
.advanced .grid { margin-top: 8px; }

.actions { display: flex; gap: 8px; margin: 16px 0; }
.btn-primary {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger {
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #dc2626;
  font-size: 14px;
  cursor: pointer;
}
.btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }

.progress-section { margin: 12px 0; }
.progress-header { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-bottom: 4px; }
.progress-bar { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: #2563eb; transition: width 0.3s; border-radius: 3px; }

.err { color: #ef4444; margin-top: 8px; }

.results { margin-top: 12px; }
.results output { font-weight: 500; }

.error-details { margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
.error-details h4 { font-size: 13px; color: #666; margin-bottom: 6px; }
.error-row { color: #ef4444; font-size: 13px; margin-bottom: 2px; }
.error-row b { color: #dc2626; }
</style>
