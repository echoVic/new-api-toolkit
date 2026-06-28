import { describe, it, expect } from 'vitest'
import { mapModelsDevToPresets } from '../lib/mapModelsDev'

const SAMPLE = {
  anthropic: {
    name: 'Anthropic',
    models: {
      'claude-opus-4-5': {
        id: 'claude-opus-4-5',
        name: 'Claude Opus 4.5',
        release_date: '2025-11-24',
        limit: { context: 200000, output: 64000 },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
      'no-price-model': {
        id: 'no-price-model',
        name: 'No Price',
        limit: { context: 1000 },
        cost: {},
      },
    },
  },
  deepseek: {
    name: 'DeepSeek',
    models: {
      'deepseek-chat': {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        release_date: '2025-01-01',
        limit: { context: 128000 },
        cost: { input: 0.27, output: 1.1 },
      },
    },
  },
  someaggregator: {
    name: 'Agg',
    models: { 'x/y': { id: 'x/y', cost: { input: 1, output: 2 }, limit: { context: 100 } } },
  },
}

const OPTS = {
  providerWhitelist: ['anthropic', 'deepseek'],
  tokenFactors: { deepseek: 1.1 },
}

describe('mapModelsDevToPresets', () => {
  it('按白名单筛选 provider，跳过非白名单', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    expect(out.find((m) => m.name === 'x/y')).toBeUndefined()
  })

  it('过滤无 cost.input 的模型', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    expect(out.find((m) => m.name === 'no-price-model')).toBeUndefined()
  })

  it('字段映射正确', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    const opus = out.find((m) => m.name === 'claude-opus-4-5')!
    expect(opus.inputPricePer1M).toBe(5)
    expect(opus.outputPricePer1M).toBe(25)
    expect(opus.cachedInputPricePer1M).toBe(0.5)
    expect(opus.contextTokens).toBe(200000)
    expect(opus.provider).toBe('Anthropic')
  })

  it('cache_read 缺失时不设 cachedInputPricePer1M', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    const ds = out.find((m) => m.name === 'deepseek-chat')!
    expect(ds.cachedInputPricePer1M).toBeUndefined()
  })

  it('tokenFactor 按 provider 补值，缺省为 1', () => {
    const out = mapModelsDevToPresets(SAMPLE, OPTS)
    expect(out.find((m) => m.name === 'deepseek-chat')!.tokenFactor).toBe(1.1)
    expect(out.find((m) => m.name === 'claude-opus-4-5')!.tokenFactor).toBe(1)
  })

  it('空/缺字段不抛错', () => {
    expect(() => mapModelsDevToPresets({}, OPTS)).not.toThrow()
    expect(mapModelsDevToPresets({}, OPTS)).toEqual([])
    expect(() => mapModelsDevToPresets({ anthropic: {} }, OPTS)).not.toThrow()
  })
})
