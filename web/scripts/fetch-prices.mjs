// 构建前运行：从 models.dev 拉取真实价格，生成 data/models.generated.ts。
// 拉取/解析失败时回退复制 data/models.fallback.ts 的内容，构建不中断。
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'data')
const generatedPath = join(dataDir, 'models.generated.ts')
const fallbackPath = join(dataDir, 'models.fallback.ts')

const PROVIDER_WHITELIST = [
  'anthropic', 'openai', 'google', 'deepseek', 'xai',
  'zhipuai', 'moonshotai', 'minimax', 'mistral',
]
const TOKEN_FACTORS = {
  deepseek: 1.1, zhipuai: 1.1, moonshotai: 1.1, minimax: 1.1, alibaba: 1.1,
}

// 与 lib/mapModelsDev.ts 同逻辑（脚本是 .mjs，不能 import .ts，故内联一份）。
function mapModelsDevToPresets(apiJson, opts) {
  const data = apiJson ?? {}
  const out = []
  for (const providerId of opts.providerWhitelist) {
    const provider = data[providerId]
    if (!provider || typeof provider !== 'object') continue
    const models = provider.models
    if (!models || typeof models !== 'object') continue
    const providerName = typeof provider.name === 'string' ? provider.name : providerId
    const factor = opts.tokenFactors[providerId] ?? 1
    for (const model of Object.values(models)) {
      const cost = model?.cost
      if (!cost || typeof cost.input !== 'number') continue
      const preset = {
        name: model.id,
        inputPricePer1M: cost.input,
        outputPricePer1M: typeof cost.output === 'number' ? cost.output : 0,
        provider: providerName,
        tokenFactor: factor,
      }
      if (typeof model?.limit?.context === 'number') preset.contextTokens = model.limit.context
      if (typeof cost.cache_read === 'number') preset.cachedInputPricePer1M = cost.cache_read
      out.push(preset)
    }
  }
  return out
}

function renderModule(presets, updatedAt) {
  return `import type { ModelPreset } from './modelPreset'

// 自动生成：源 https://models.dev/api.json — 请勿手改。
export const PRICE_UPDATED_AT = ${JSON.stringify(updatedAt)}

export const MODEL_PRESETS: ModelPreset[] = ${JSON.stringify(presets, null, 2)}
`
}

async function useFallback(reason) {
  console.warn(`⚠ 拉取 models.dev 失败（${reason}），使用 fallback 数据`)
  const content = await readFile(fallbackPath, 'utf8')
  await writeFile(generatedPath, content, 'utf8')
}

async function main() {
  try {
    const resp = await fetch('https://models.dev/api.json')
    if (!resp.ok) return await useFallback(`HTTP ${resp.status}`)
    const json = await resp.json()
    const presets = mapModelsDevToPresets(json, {
      providerWhitelist: PROVIDER_WHITELIST,
      tokenFactors: TOKEN_FACTORS,
    })
    if (presets.length === 0) return await useFallback('映射结果为空')
    const today = new Date().toISOString().slice(0, 10)
    await writeFile(generatedPath, renderModule(presets, today), 'utf8')
    console.log(`✓ 已从 models.dev 生成 ${presets.length} 个模型价格 → data/models.generated.ts`)
  } catch (err) {
    await useFallback(err?.message || String(err))
  }
}

main()
