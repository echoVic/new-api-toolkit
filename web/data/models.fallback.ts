import type { ModelPreset } from './modelPreset'

export const PRICE_UPDATED_AT = '2026-06-28'

// 兜底数据：当 models.dev 拉取失败时使用。手工维护的真实快照。
export const MODEL_PRESETS: ModelPreset[] = [
  { name: 'claude-opus-4-8', inputPricePer1M: 5, outputPricePer1M: 25, provider: 'Anthropic', contextTokens: 1000000, cachedInputPricePer1M: 0.5, tokenFactor: 1 },
  { name: 'claude-sonnet-4-6', inputPricePer1M: 3, outputPricePer1M: 15, provider: 'Anthropic', contextTokens: 1000000, cachedInputPricePer1M: 0.3, tokenFactor: 1 },
  { name: 'claude-haiku-4-5', inputPricePer1M: 1, outputPricePer1M: 5, provider: 'Anthropic', contextTokens: 200000, cachedInputPricePer1M: 0.1, tokenFactor: 1 },
  { name: 'gpt-5.5', inputPricePer1M: 5, outputPricePer1M: 30, provider: 'OpenAI', contextTokens: 1050000, cachedInputPricePer1M: 0.5, tokenFactor: 1 },
  { name: 'gpt-5.4', inputPricePer1M: 2.5, outputPricePer1M: 15, provider: 'OpenAI', contextTokens: 1050000, cachedInputPricePer1M: 0.25, tokenFactor: 1 },
  { name: 'gemini-3-pro', inputPricePer1M: 2, outputPricePer1M: 12, provider: 'Google', contextTokens: 2000000, cachedInputPricePer1M: 0.2, tokenFactor: 1 },
  { name: 'deepseek-v3', inputPricePer1M: 0.27, outputPricePer1M: 1.1, provider: 'DeepSeek', contextTokens: 128000, tokenFactor: 1.1 },
]
