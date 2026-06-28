export const PRICE_UPDATED_AT = '2026-06-28'

export interface ModelPreset {
  name: string
  inputPricePer1M: number // 官方输入价 $/1M
  outputPricePer1M: number // 官方输出价 $/1M
}

export const MODEL_PRESETS: ModelPreset[] = [
  { name: 'gpt-4o', inputPricePer1M: 2.5, outputPricePer1M: 10 },
  { name: 'gpt-4o-mini', inputPricePer1M: 0.15, outputPricePer1M: 0.6 },
  { name: 'claude-3-5-sonnet', inputPricePer1M: 3, outputPricePer1M: 15 },
  { name: 'claude-3-opus', inputPricePer1M: 15, outputPricePer1M: 75 },
  { name: 'gemini-1.5-pro', inputPricePer1M: 1.25, outputPricePer1M: 5 },
  { name: 'deepseek-chat', inputPricePer1M: 0.27, outputPricePer1M: 1.1 },
]
