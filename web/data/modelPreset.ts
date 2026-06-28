export interface ModelPreset {
  name: string
  inputPricePer1M: number // 官方输入价 $/1M
  outputPricePer1M: number // 官方输出价 $/1M
  provider?: string // 厂商分组
  contextTokens?: number // 上下文窗口
  cachedInputPricePer1M?: number // 缓存输入价（可选）
  tokenFactor?: number // 相对 OpenAI tokenizer 的 token 估算系数，缺省 1
}
