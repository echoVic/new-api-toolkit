export function estimateTokensForModel(openaiTokens: number, factor?: number): number {
  return Math.round(openaiTokens * (factor ?? 1))
}

export interface CallCostInput {
  inputTokens: number
  outputTokens: number
  inputPricePer1M: number
  outputPricePer1M: number
}

export function costForCall(input: CallCostInput): number {
  const { inputTokens, outputTokens, inputPricePer1M, outputPricePer1M } = input
  return (inputTokens * inputPricePer1M + outputTokens * outputPricePer1M) / 1_000_000
}
