export const PRICE_UPDATED_AT = '2026-06-28'

export interface ModelPreset {
  name: string
  inputPricePer1M: number // 官方输入价 $/1M
  outputPricePer1M: number // 官方输出价 $/1M
}

export const MODEL_PRESETS: ModelPreset[] = [
  { name: 'claude-opus-4-8', inputPricePer1M: 5, outputPricePer1M: 25 },
  { name: 'claude-sonnet-4-6', inputPricePer1M: 3, outputPricePer1M: 15 },
  { name: 'claude-haiku-4-5', inputPricePer1M: 1, outputPricePer1M: 5 },
  { name: 'gpt-5.5', inputPricePer1M: 5, outputPricePer1M: 30 },
  { name: 'gpt-5.4', inputPricePer1M: 2.5, outputPricePer1M: 15 },
  { name: 'gemini-3-pro', inputPricePer1M: 2, outputPricePer1M: 12 },
  { name: 'deepseek-v3', inputPricePer1M: 0.27, outputPricePer1M: 1.1 },
]
