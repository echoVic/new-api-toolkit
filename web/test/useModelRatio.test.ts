import { describe, it, expect } from 'vitest'
import {
  modelRatioToInputPrice,
  inputPriceToModelRatio,
  outputPriceFromCompletionRatio,
  completionRatioFromPrices,
  estimateCostUsd,
} from '../composables/useModelRatio'

describe('模型倍率 ↔ 价格 双向换算', () => {
  it('模型倍率转输入价：倍率1 = $2/1M', () => {
    expect(modelRatioToInputPrice(1)).toBe(2)
    expect(modelRatioToInputPrice(0.5)).toBe(1)
  })

  it('输入价转模型倍率：$2/1M = 倍率1', () => {
    expect(inputPriceToModelRatio(2)).toBe(1)
    expect(inputPriceToModelRatio(10)).toBe(5)
  })

  it('补全倍率 + 输入价 = 输出价', () => {
    expect(outputPriceFromCompletionRatio(10, 3)).toBe(30)
  })

  it('输入价与输出价反推补全倍率', () => {
    expect(completionRatioFromPrices(10, 30)).toBe(3)
  })

  it('输入价为 0 时补全倍率返回 0（避免除零）', () => {
    expect(completionRatioFromPrices(0, 30)).toBe(0)
  })
})

describe('费用估算', () => {
  it('套用 new-api 公式：分组×模型×(输入+输出×补全)/500000', () => {
    const usd = estimateCostUsd({
      groupRatio: 1,
      modelRatio: 0.25,
      completionRatio: 3,
      inputTokens: 3000,
      outputTokens: 500,
    })
    expect(usd).toBeCloseTo(0.00225, 8)
  })

  it('缺失值按 0 处理，不抛错', () => {
    expect(
      estimateCostUsd({
        groupRatio: 0,
        modelRatio: 0,
        completionRatio: 0,
        inputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0)
  })
})
