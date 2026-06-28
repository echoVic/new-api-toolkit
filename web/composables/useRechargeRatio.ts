export interface RechargeInput {
  exchange: number // 汇率 USD->CNY
  siteRate: number // 站点充值倍率
  discount: number // 折扣（十分制，如 8 表示 8 折）
}

export interface RechargeResult {
  payRate: number // 实付倍率
  usdPerCny: number // 每 1 元人民币折合的美元额度
  normalizedCny: number // 折合：每 1 美元额度对应的人民币
}

export function calcRecharge(input: RechargeInput): RechargeResult | null {
  const { exchange, siteRate, discount } = input
  if (!exchange || !siteRate || !discount) return null
  const payRate = siteRate * (discount / 10)
  const normalizedCny = exchange * payRate
  const usdPerCny = 1 / normalizedCny
  return { payRate, usdPerCny, normalizedCny }
}
