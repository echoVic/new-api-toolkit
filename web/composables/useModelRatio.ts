// new-api 计费基准：倍率 1 = $2 / 1M tokens（即 $0.002 / 1K）
const USD_PER_1M_AT_RATIO_1 = 2
const QUOTA_DIVISOR = 500000

export function modelRatioToInputPrice(modelRatio: number): number {
  return modelRatio * USD_PER_1M_AT_RATIO_1
}

export function inputPriceToModelRatio(inputPricePer1M: number): number {
  return inputPricePer1M / USD_PER_1M_AT_RATIO_1
}

export function outputPriceFromCompletionRatio(
  inputPricePer1M: number,
  completionRatio: number,
): number {
  return inputPricePer1M * completionRatio
}

export function completionRatioFromPrices(
  inputPricePer1M: number,
  outputPricePer1M: number,
): number {
  if (!inputPricePer1M) return 0
  return outputPricePer1M / inputPricePer1M
}

export interface CostInput {
  groupRatio: number
  modelRatio: number
  completionRatio: number
  inputTokens: number
  outputTokens: number
}

export function estimateCostUsd(input: CostInput): number {
  const { groupRatio, modelRatio, completionRatio, inputTokens, outputTokens } = input
  return (
    (groupRatio * modelRatio * (inputTokens + outputTokens * completionRatio)) /
    QUOTA_DIVISOR
  )
}
