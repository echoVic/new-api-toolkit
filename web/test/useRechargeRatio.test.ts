import { describe, it, expect } from 'vitest'
import { calcRecharge } from '../composables/useRechargeRatio'

describe('充值倍率换算', () => {
  it('实付倍率 = 站点倍率 × 折扣/10', () => {
    const r = calcRecharge({ exchange: 7.2, siteRate: 2, discount: 8 })
    expect(r!.payRate).toBeCloseTo(1.6, 8)
  })

  it('折算成本字段计算正确', () => {
    const r = calcRecharge({ exchange: 7.2, siteRate: 2, discount: 8 })
    expect(r!.normalizedCny).toBeCloseTo(11.52, 8)
    expect(r!.usdPerCny).toBeCloseTo(1 / 11.52, 8)
  })

  it('任一输入为 0/空时返回 null（无法计算）', () => {
    expect(calcRecharge({ exchange: 0, siteRate: 2, discount: 8 })).toBeNull()
    expect(calcRecharge({ exchange: 7.2, siteRate: 0, discount: 8 })).toBeNull()
    expect(calcRecharge({ exchange: 7.2, siteRate: 2, discount: 0 })).toBeNull()
  })
})
