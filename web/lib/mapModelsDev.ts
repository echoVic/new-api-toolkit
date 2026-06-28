import type { ModelPreset } from '../data/modelPreset'

interface MapOpts {
  providerWhitelist: string[]
  tokenFactors: Record<string, number>
}

export function mapModelsDevToPresets(apiJson: unknown, opts: MapOpts): ModelPreset[] {
  const data = (apiJson ?? {}) as Record<string, any>
  const out: ModelPreset[] = []

  for (const providerId of opts.providerWhitelist) {
    const provider = data[providerId]
    if (!provider || typeof provider !== 'object') continue
    const models = provider.models
    if (!models || typeof models !== 'object') continue
    const providerName = typeof provider.name === 'string' ? provider.name : providerId
    const factor = opts.tokenFactors[providerId] ?? 1

    for (const model of Object.values(models) as any[]) {
      const cost = model?.cost
      if (!cost || typeof cost.input !== 'number') continue

      const id = model.id
      if (typeof id !== 'string') continue
      if (/-20\d{6}$/.test(id)) continue            // dated snapshot duplicate of an alias
      if (/^(claude-[23]|gpt-3)/.test(id)) continue // legacy generations

      const preset: ModelPreset = {
        name: model.id,
        inputPricePer1M: cost.input,
        outputPricePer1M: typeof cost.output === 'number' ? cost.output : 0,
        provider: providerName,
        tokenFactor: factor,
      }
      if (typeof model?.limit?.context === 'number') preset.contextTokens = model.limit.context
      if (typeof cost.cache_read === 'number') preset.cachedInputPricePer1M = cost.cache_read
      out.push(preset)
    }
  }

  return out
}
