export interface BenchConfig {
  baseURL: string
  apiKey: string
  model: string
  concurrency: number
  totalRequests: number
  apiFormat: 'openai' | 'anthropic'
  stream: boolean
  prompt: string
  maxTokens: number
}

export interface BenchLatency {
  latencyMs: number
  tokens: number
  ttftMs?: number
  tps?: number
  error: string | null
}

export interface BenchProgress {
  completed: number
  succeeded: number
  failed: number
  total: number
  elapsedMs: number
}

export interface BenchResult {
  total: number
  success: number
  errors: number
  successRate: string
  avgLatencyMs: number
  p50Ms: number
  p90Ms: number
  p99Ms: number
  rpm: number
  tpm: number
  totalTokens: number
  totalDurationMs: number
  errorDetails: { message: string; count: number }[]
  avgTtftMs?: number
  p90TtftMs?: number
  avgTps?: number
  p50Tps?: number
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const idx = Math.ceil((p / 100) * arr.length) - 1
  return arr[Math.max(0, idx)]
}

export function computeBenchMetrics(
  latencies: BenchLatency[],
  startTime: number,
  totalRequests: number,
): BenchResult {
  const totalDurationMs = Date.now() - startTime
  const successResults = latencies.filter((r) => !r.error)
  const failedResults = latencies.filter((r) => r.error)

  const sortedLatencies = successResults.map((r) => r.latencyMs).sort((a, b) => a - b)

  const totalTokens = successResults.reduce((sum, r) => sum + r.tokens, 0)
  const avgLatency =
    sortedLatencies.length > 0 ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length : 0

  const rpm = totalDurationMs > 0 ? totalRequests / (totalDurationMs / 60000) : 0
  const tpm = totalDurationMs > 0 ? totalTokens / (totalDurationMs / 60000) : 0

  const errorMap: Record<string, number> = {}
  failedResults.forEach((r) => {
    const key = r.error || 'unknown'
    errorMap[key] = (errorMap[key] || 0) + 1
  })
  const errorDetails = Object.entries(errorMap).map(([message, count]) => ({ message, count }))

  const result: BenchResult = {
    total: totalRequests,
    success: successResults.length,
    errors: failedResults.length,
    successRate: totalRequests > 0 ? ((successResults.length / totalRequests) * 100).toFixed(1) : '0',
    avgLatencyMs: Math.round(avgLatency),
    p50Ms: Math.round(percentile(sortedLatencies, 50)),
    p90Ms: Math.round(percentile(sortedLatencies, 90)),
    p99Ms: Math.round(percentile(sortedLatencies, 99)),
    rpm: Math.round(rpm * 10) / 10,
    tpm: Math.round(tpm * 10) / 10,
    totalTokens,
    totalDurationMs,
    errorDetails,
  }

  const streamResults = successResults.filter((r) => r.ttftMs !== undefined)
  if (streamResults.length > 0) {
    const sortedTtft = streamResults.map((r) => r.ttftMs!).sort((a, b) => a - b)
    const sortedTps = streamResults
      .map((r) => r.tps!)
      .filter((t) => t > 0)
      .sort((a, b) => a - b)

    result.avgTtftMs = Math.round(sortedTtft.reduce((a, b) => a + b, 0) / sortedTtft.length)
    result.p90TtftMs = Math.round(percentile(sortedTtft, 90))
    result.avgTps = sortedTps.length > 0 ? Math.round((sortedTps.reduce((a, b) => a + b, 0) / sortedTps.length) * 10) / 10 : 0
    result.p50Tps = sortedTps.length > 0 ? Math.round(percentile(sortedTps, 50) * 10) / 10 : 0
  }

  return result
}

async function makeBenchRequest(
  baseURL: string,
  apiKey: string,
  model: string,
  apiFormat: 'openai' | 'anthropic',
  stream: boolean,
  signal: AbortSignal,
  prompt: string,
  maxTokens: number,
): Promise<BenchLatency> {
  const start = Date.now()
  const base = baseURL.replace(/\/+$/, '')
  const userContent = prompt || 'Say hi in one word.'
  const mTokens = maxTokens || 50
  let url: string, headers: Record<string, string>, payload: Record<string, unknown>

  if (apiFormat === 'anthropic') {
    url = `${base}/v1/messages`
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    payload = { model, messages: [{ role: 'user', content: userContent }], max_tokens: mTokens }
    if (stream) payload.stream = true
  } else {
    url = `${base}/v1/chat/completions`
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    payload = { model, messages: [{ role: 'user', content: userContent }], max_tokens: mTokens }
    if (stream) payload.stream = true
  }

  const body = JSON.stringify(payload)

  try {
    const resp = await fetch(url, { method: 'POST', headers, body, signal })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return { latencyMs: Date.now() - start, tokens: 0, error: `HTTP ${resp.status}: ${text.slice(0, 80)}` }
    }

    if (stream) {
      return await parseStreamResponse(resp, start, apiFormat)
    }

    const latencyMs = Date.now() - start
    const data = await resp.json()
    let tokens = 0
    if (apiFormat === 'anthropic') {
      tokens = data?.usage?.output_tokens || 0
    } else {
      tokens = data?.usage?.completion_tokens || 0
    }
    return { latencyMs, tokens, error: null }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return { latencyMs: Date.now() - start, tokens: 0, error: (err as Error).message }
  }
}

async function parseStreamResponse(
  resp: Response,
  startTime: number,
  apiFormat: 'openai' | 'anthropic',
): Promise<BenchLatency> {
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let ttftMs: number | null = null
  let tokenCount = 0
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (ttftMs === null) {
        ttftMs = Date.now() - startTime
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue

        try {
          const chunk = JSON.parse(payload)
          if (apiFormat === 'anthropic') {
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              tokenCount++
            }
          } else {
            if (chunk.choices?.[0]?.delta?.content) {
              tokenCount++
            }
          }
        } catch {
          // ignore parse errors for partial chunks
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
  }

  const latencyMs = Date.now() - startTime
  const generationMs = ttftMs !== null ? latencyMs - ttftMs : 0
  const tps = generationMs > 0 ? tokenCount / (generationMs / 1000) : 0

  return { latencyMs, tokens: tokenCount, ttftMs: ttftMs || latencyMs, tps, error: null }
}

export function runBenchmark(
  config: BenchConfig,
  signal: AbortSignal,
  onProgress: (progress: BenchProgress) => void,
): Promise<BenchResult> {
  const { baseURL, apiKey, model, concurrency, totalRequests, apiFormat, stream, prompt, maxTokens } = config
  const latencies: BenchLatency[] = []
  let completed = 0
  let succeeded = 0
  let failed = 0
  const startTime = Date.now()

  let nextIndex = 0
  const inFlight = new Set<Promise<void>>()

  return new Promise((resolve, reject) => {
    function checkDone() {
      if (completed >= totalRequests) {
        resolve(computeBenchMetrics(latencies, startTime, totalRequests))
      }
    }

    function launchOne(): Promise<void> | null {
      if (signal.aborted) return null
      if (nextIndex >= totalRequests) return null
      nextIndex++

      const promise = makeBenchRequest(baseURL, apiKey, model, apiFormat, stream, signal, prompt, maxTokens)
        .then((result) => {
          latencies.push(result)
          if (result.error) failed++
          else succeeded++
        })
        .catch((err) => {
          latencies.push({ latencyMs: 0, tokens: 0, error: (err as Error).message })
          failed++
        })
        .finally(() => {
          completed++
          inFlight.delete(promise)
          onProgress({ completed, succeeded, failed, total: totalRequests, elapsedMs: Date.now() - startTime })

          if (signal.aborted) {
            // 中止时返回已采集的部分结果，而非丢弃
            if (inFlight.size === 0) resolve(computeBenchMetrics(latencies, startTime, completed))
            return
          }

          const next = launchOne()
          if (next) inFlight.add(next)
          checkDone()
        })
      return promise
    }

    const initialCount = Math.min(concurrency, totalRequests)
    for (let i = 0; i < initialCount; i++) {
      const p = launchOne()
      if (p) inFlight.add(p)
    }

    if (initialCount === 0) resolve(computeBenchMetrics([], startTime, 0))
  })
}
