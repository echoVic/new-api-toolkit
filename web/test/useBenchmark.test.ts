import { describe, it, expect } from 'vitest'
import { computeBenchMetrics } from '../composables/useBenchmark'
import type { BenchLatency } from '../composables/useBenchmark'

describe('压测指标计算', () => {
  const frozenNow = Date.now()

  function makeLatency(
    latencyMs: number,
    tokens: number,
    error: string | null = null,
    ttftMs?: number,
    tps?: number,
  ): BenchLatency {
    return { latencyMs, tokens, error, ttftMs, tps }
  }

  it('空列表返回全零', () => {
    const result = computeBenchMetrics([], frozenNow, 0)
    expect(result.total).toBe(0)
    expect(result.success).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.successRate).toBe('0')
    expect(result.avgLatencyMs).toBe(0)
    expect(result.p50Ms).toBe(0)
  })

  it('成功请求的百分位延迟计算', () => {
    const latencies: BenchLatency[] = [
      makeLatency(100, 10),
      makeLatency(200, 15),
      makeLatency(300, 20),
      makeLatency(400, 25),
      makeLatency(500, 30),
    ]
    const result = computeBenchMetrics(latencies, frozenNow - 10000, 5)
    expect(result.total).toBe(5)
    expect(result.success).toBe(5)
    expect(result.errors).toBe(0)
    expect(result.successRate).toBe('100.0')
    expect(result.avgLatencyMs).toBe(300)
    expect(result.p50Ms).toBe(300)
    expect(result.p90Ms).toBe(500)
    expect(result.p99Ms).toBe(500)
    expect(result.totalTokens).toBe(100)
    expect(result.errorDetails).toEqual([])
  })

  it('失败请求计入 errors 和 errorDetails', () => {
    const latencies: BenchLatency[] = [
      makeLatency(100, 10),
      makeLatency(50, 0, 'timeout'),
      makeLatency(50, 0, 'timeout'),
      makeLatency(200, 15),
    ]
    const result = computeBenchMetrics(latencies, frozenNow - 60000, 4)
    expect(result.total).toBe(4)
    expect(result.success).toBe(2)
    expect(result.errors).toBe(2)
    expect(result.successRate).toBe('50.0')
    expect(result.errorDetails).toEqual([{ message: 'timeout', count: 2 }])
    expect(result.totalTokens).toBe(25)
  })

  it('RPM 和 TPM 计算正确', () => {
    // 10 秒完成 6 个请求，共 60 tokens
    const latencies: BenchLatency[] = [
      makeLatency(100, 10),
      makeLatency(100, 10),
      makeLatency(100, 10),
      makeLatency(100, 10),
      makeLatency(100, 10),
      makeLatency(100, 10),
    ]
    const result = computeBenchMetrics(latencies, frozenNow - 10000, 6)
    // RPM = 6 / (10/60) = 36, TPM = 60 / (10/60) = 360
    expect(result.rpm).toBeCloseTo(36, 0)
    expect(result.tpm).toBeCloseTo(360, 0)
  })

  it('流式模式返回 TTFT 和 TPS 指标', () => {
    const latencies: BenchLatency[] = [
      makeLatency(1000, 20, null, 200, 25),
      makeLatency(1200, 25, null, 250, 24),
    ]
    const result = computeBenchMetrics(latencies, frozenNow - 5000, 2)
    expect(result.avgTtftMs).toBe(225)
    expect(result.p90TtftMs).toBe(250)
    // tps: 25, 24 → avg=24.5, p50=24
    expect(result.avgTps).toBeCloseTo(24.5, 0)
    expect(result.p50Tps).toBeCloseTo(24, 0)
  })

  it('混合成功/失败时不崩溃', () => {
    const latencies: BenchLatency[] = [
      makeLatency(100, 10, null, 50, 20),
      makeLatency(0, 0, 'network error'),
      makeLatency(200, 15, null, 80, 18),
    ]
    const result = computeBenchMetrics(latencies, frozenNow - 30000, 3)
    expect(result.success).toBe(2)
    expect(result.errors).toBe(1)
    expect(result.avgTtftMs).toBe(65)
  })
})
