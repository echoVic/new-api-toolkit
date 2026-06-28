import { describe, it, expect } from 'vitest'
import { estimateTokensForModel, costForCall } from '../composables/useTokenCalc'

describe('estimateTokensForModel', () => {
  it('系数缺省时等于原值', () => {
    expect(estimateTokensForModel(1000)).toBe(1000)
  })

  it('按系数放大并四舍五入', () => {
    expect(estimateTokensForModel(1000, 1.1)).toBe(1100)
    expect(estimateTokensForModel(333, 1.1)).toBe(366) // 366.3 → 366
  })

  it('0 token 返回 0', () => {
    expect(estimateTokensForModel(0, 1.5)).toBe(0)
  })
})

describe('costForCall', () => {
  it('按输入+输出 token 与单价算费用（美元）', () => {
    const usd = costForCall({
      inputTokens: 1000,
      outputTokens: 500,
      inputPricePer1M: 5,
      outputPricePer1M: 25,
    })
    expect(usd).toBeCloseTo(0.0175, 8)
  })

  it('仅输入 / 仅输出 / 全 0', () => {
    expect(costForCall({ inputTokens: 1000, outputTokens: 0, inputPricePer1M: 3, outputPricePer1M: 15 })).toBeCloseTo(0.003, 8)
    expect(costForCall({ inputTokens: 0, outputTokens: 1000, inputPricePer1M: 3, outputPricePer1M: 15 })).toBeCloseTo(0.015, 8)
    expect(costForCall({ inputTokens: 0, outputTokens: 0, inputPricePer1M: 3, outputPricePer1M: 15 })).toBe(0)
  })
})
