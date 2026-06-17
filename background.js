/**
 * 站长工具 - Background Service Worker
 *
 * 渠道监控：定时轮询关注渠道的报错率，超过阈值时发送 Chrome 系统通知
 *
 * 配置存储在 chrome.storage.local:
 * {
 *   monitor_config: {
 *     enabled: boolean,
 *     apiBase: string,          // New API 后端地址（如 https://api.example.com）
 *     token: string,            // Access Token（Bearer 鉴权）
 *     userId: string,           // 用户 ID（New-Api-User header）
 *     intervalMinutes: number,  // 轮询间隔（1-30，默认 5）
 *     threshold: number,        // 报错率阈值百分比（如 20 表示 20%）
 *     channels: [               // 关注的渠道列表
 *       { id: number, name: string }
 *     ],
 *     windowMinutes: number,    // 统计窗口（分钟），默认与 intervalMinutes 相同
 *   }
 * }
 */

const ALARM_NAME = 'napi-channel-monitor'
const DEFAULT_INTERVAL = 5
const DEFAULT_THRESHOLD = 20
const DEFAULT_WINDOW = 5

// =========================================================================
// 初始化
// =========================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[NAPI Monitor] Extension installed/updated')
  initAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  initAlarm()
})

// 配置变更时重设 alarm
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.monitor_config) {
    console.log('[NAPI Monitor] Config changed, resetting alarm')
    initAlarm()
  }
})

// Alarm 触发
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runMonitorCheck()
    runBalanceCheck() // 余额也随轮询检查
  }
})

// 支持从 popup 手动触发
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'NAPI_MONITOR_CHECK_NOW') {
    runMonitorCheck().then(sendResponse)
    return true
  }
  if (msg.type === 'NAPI_MONITOR_GET_STATUS') {
    chrome.storage.local.get('monitor_last_result', (data) => {
      sendResponse(data.monitor_last_result || null)
    })
    return true
  }
  if (msg.type === 'NAPI_BALANCE_CHECK') {
    runBalanceCheck().then(sendResponse)
    return true
  }
  if (msg.type === 'NAPI_BALANCE_SITES_CHECK') {
    runMultiSiteBalanceCheck().then(sendResponse)
    return true
  }
  if (msg.type === 'NAPI_BALANCE_SITE_CHECK_ONE') {
    checkSiteLogin(msg.site).then(sendResponse)
    return true
  }
  if (msg.type === 'NAPI_FETCH_MAIN_TODAY') {
    fetchMainSiteTodayUsed(msg.apiBase).then(sendResponse)
    return true
  }
  if (msg.type === 'NAPI_BENCH_STATUS') {
    sendResponse({
      running: !!activeBenchmark,
      lastResult: lastBenchResult,
    })
    return true
  }
})

// =========================================================================
// Alarm 管理
// =========================================================================

async function initAlarm() {
  const { monitor_config: config } = await chrome.storage.local.get('monitor_config')

  // 清除已有 alarm
  await chrome.alarms.clear(ALARM_NAME)

  if (!config?.enabled || !config.channels?.length) {
    console.log('[NAPI Monitor] Disabled or no channels configured')
    return
  }

  const interval = Math.max(1, Math.min(30, config.intervalMinutes || DEFAULT_INTERVAL))
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: interval })
  console.log(`[NAPI Monitor] Alarm set: every ${interval} min, watching ${config.channels.length} channels`)
}

// =========================================================================
// 监控检查
// =========================================================================

async function runMonitorCheck() {
  const { monitor_config: config } = await chrome.storage.local.get('monitor_config')

  if (!config?.enabled || !config.apiBase || !config.channels?.length) {
    return { success: false, reason: 'not_configured' }
  }

  // 仅管理员可执行监控（role >= 10）
  if ((config.role ?? 0) < 10) {
    return { success: false, reason: 'not_admin' }
  }

  const windowMinutes = config.windowMinutes || config.intervalMinutes || DEFAULT_WINDOW
  const threshold = config.threshold ?? DEFAULT_THRESHOLD
  const now = Math.floor(Date.now() / 1000)
  const startTimestamp = now - windowMinutes * 60

  const results = []
  const alerts = []

  for (const channel of config.channels) {
    try {
      // 并行查错误数和总数
      const [errorCount, totalCount] = await Promise.all([
        fetchLogCount(config, { channel: channel.id, type: 5, startTimestamp }),
        fetchLogCount(config, { channel: channel.id, type: 0, startTimestamp }),
      ])

      const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0
      const entry = {
        channelId: channel.id,
        channelName: channel.name,
        errorCount,
        totalCount,
        errorRate: Math.round(errorRate * 10) / 10,
        exceeded: errorRate > threshold,
      }
      results.push(entry)

      if (entry.exceeded) {
        alerts.push(entry)
      }
    } catch (err) {
      results.push({
        channelId: channel.id,
        channelName: channel.name,
        error: err.message,
      })
    }
  }

  // 保存最近一次结果
  const lastResult = {
    timestamp: Date.now(),
    results,
    alerts,
    threshold,
    windowMinutes,
  }
  await chrome.storage.local.set({ monitor_last_result: lastResult })

  // 触发告警（通知 + Badge）
  let notifyResult = null
  if (alerts.length > 0) {
    notifyResult = await sendAlert(alerts, threshold, windowMinutes)
    // 无论通知是否成功，都设置 Badge 闪烁
    await setBadgeAlert(alerts.length)
  } else {
    // 无告警时清除 Badge
    await clearBadge()
  }

  console.log(`[NAPI Monitor] Check done: ${results.length} channels, ${alerts.length} alerts`)
  return { success: true, results, alerts, notifyResult, threshold, windowMinutes, timestamp: Date.now() }
}

// =========================================================================
// API 请求
// =========================================================================

async function fetchLogCount(config, { channel, type, startTimestamp }) {
  const params = new URLSearchParams({
    p: '1',
    page_size: '1', // 只需要 total 字段
    channel: String(channel),
    start_timestamp: String(startTimestamp),
  })

  // type=0 表示查全部，不传 type 参数让后端默认为 0
  if (type !== 0) {
    params.set('type', String(type))
  }

  const url = `${config.apiBase.replace(/\/$/, '')}/api/log/?${params.toString()}`

  const headers = {
    Accept: 'application/json',
    'Cache-Control': 'no-store',
  }

  if (config.token) {
    headers['Authorization'] = config.token
  }
  if (config.userId) {
    headers['New-Api-User'] = config.userId
  }

  const resp = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const data = await resp.json()

  // new-api 返回格式: { success: true, data: { items: [...], total: N } }
  if (data?.data?.total !== undefined) {
    return data.data.total
  }
  // 兼容旧版本格式
  if (typeof data?.total === 'number') {
    return data.total
  }

  return 0
}

// =========================================================================
// 余额检查
// =========================================================================

async function runBalanceCheck() {
  const { monitor_config: config } = await chrome.storage.local.get('monitor_config')

  if (!config?.apiBase || !config.channels?.length) {
    return { success: false, reason: 'not_configured' }
  }

  if ((config.role ?? 0) < 10) {
    return { success: false, reason: 'not_admin' }
  }

  const balanceThreshold = config.balanceThreshold ?? 10
  const balances = []
  const lowBalanceAlerts = []

  for (const channel of config.channels) {
    try {
      const balance = await fetchChannelBalance(config, channel.id)
      const entry = {
        channelId: channel.id,
        channelName: channel.name,
        balance,
        low: balance < balanceThreshold,
      }
      balances.push(entry)
      if (entry.low) {
        lowBalanceAlerts.push(entry)
      }
    } catch (err) {
      balances.push({
        channelId: channel.id,
        channelName: channel.name,
        error: err.message,
      })
    }
  }

  // 保存结果
  await chrome.storage.local.set({
    balance_last_result: { balances, timestamp: Date.now() },
  })

  // 低余额告警
  let notifyResult = null
  if (lowBalanceAlerts.length > 0) {
    notifyResult = await sendBalanceAlert(lowBalanceAlerts, balanceThreshold)
    await setBadgeAlert(lowBalanceAlerts.length)
  }

  return { success: true, balances, notifyResult }
}

async function fetchChannelBalance(config, channelId) {
  const url = `${config.apiBase.replace(/\/$/, '')}/api/channel/update_balance/${channelId}`

  const headers = {
    Accept: 'application/json',
    'Cache-Control': 'no-store',
  }
  if (config.token) headers['Authorization'] = config.token
  if (config.userId) headers['New-Api-User'] = config.userId

  const resp = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const data = await resp.json()

  if (data?.success === false) {
    throw new Error(data.message || '查询失败')
  }

  // 返回余额（单位：美元）
  return typeof data.balance === 'number' ? data.balance : 0
}

function sendBalanceAlert(alerts, threshold) {
  const lines = alerts.map(
    (a) => `${a.channelName || 'Channel #' + a.channelId}: $${a.balance.toFixed(2)}`
  )

  const title = `💰 渠道余额低于 $${threshold}`
  const message =
    alerts.length <= 3
      ? lines.join('\n')
      : lines.slice(0, 3).join('\n') + `\n... 还有 ${alerts.length - 3} 个渠道`

  return new Promise((resolve) => {
    chrome.notifications.create('napi-balance-alert-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 2,
      requireInteraction: true,
    }, (notificationId) => {
      const err = chrome.runtime.lastError
      if (err) {
        resolve({ sent: false, error: err.message })
      } else {
        resolve({ sent: true, id: notificationId })
      }
    })
  })
}

// =========================================================================
// Chrome 通知（报错率）
// =========================================================================

function sendAlert(alerts, threshold, windowMinutes) {
  const lines = alerts.map(
    (a) => `${a.channelName || 'Channel #' + a.channelId}: ${a.errorRate}%（${a.errorCount}/${a.totalCount}）`
  )

  const title = `⚠️ 渠道报错率超过 ${threshold}%`
  const message =
    alerts.length <= 3
      ? lines.join('\n')
      : lines.slice(0, 3).join('\n') + `\n... 还有 ${alerts.length - 3} 个渠道`

  return new Promise((resolve) => {
    chrome.notifications.create('napi-monitor-alert-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      contextMessage: `最近 ${windowMinutes} 分钟统计`,
      priority: 2,
      requireInteraction: true,
    }, (notificationId) => {
      const err = chrome.runtime.lastError
      if (err) {
        console.error('[NAPI Monitor] Notification failed:', err.message)
        resolve({ sent: false, error: err.message })
      } else {
        console.log('[NAPI Monitor] Notification sent:', notificationId)
        resolve({ sent: true, id: notificationId })
      }
    })
  })
}

// =========================================================================
// Badge 闪烁告警（系统通知不可用时的备选方案）
// =========================================================================

let badgeBlinkTimer = null

async function setBadgeAlert(alertCount) {
  // 先清除旧的闪烁
  if (badgeBlinkTimer) {
    clearInterval(badgeBlinkTimer)
    badgeBlinkTimer = null
  }

  const text = String(alertCount)

  // 设置红色 Badge 显示告警数量
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
  await chrome.action.setTitle({ title: `⚠ ${alertCount} 个渠道报错率超标` })

  // 闪烁效果：红色/橙色交替，持续 30 秒
  let blink = true
  badgeBlinkTimer = setInterval(async () => {
    try {
      await chrome.action.setBadgeBackgroundColor({
        color: blink ? '#f97316' : '#ef4444',
      })
      blink = !blink
    } catch (_) {
      // 扩展可能已卸载，忽略
    }
  }, 500)

  // 30 秒后停止闪烁，保持红色常亮
  setTimeout(() => {
    if (badgeBlinkTimer) {
      clearInterval(badgeBlinkTimer)
      badgeBlinkTimer = null
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }).catch(() => {})
    }
  }, 30000)
}

async function clearBadge() {
  if (badgeBlinkTimer) {
    clearInterval(badgeBlinkTimer)
    badgeBlinkTimer = null
  }
  await chrome.action.setBadgeText({ text: '' })
  await chrome.action.setTitle({ title: '站长工具' })
}

// =========================================================================
// 主站今日消费独立查询
// =========================================================================

async function fetchMainSiteTodayUsed(apiBase) {
  try {
    const { monitor_config: config } = await chrome.storage.local.get('monitor_config')
    if (!config) return { todayUsed: null }

    const base = apiBase.replace(/\/$/, '')
    const headers = { Accept: 'application/json', 'Cache-Control': 'no-store' }
    if (config.token) headers['Authorization'] = config.token
    if (config.userId) headers['New-Api-User'] = config.userId

    // 管理员：用渠道级别统计
    if (config.role >= 10) {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
      const endOfDay = Math.floor(Date.now() / 1000)
      const statUrl = `${base}/api/log/stat?type=2&start_timestamp=${startOfDay}&end_timestamp=${endOfDay}`
      const resp = await fetch(statUrl, { method: 'GET', headers, credentials: 'include' })
      if (resp.ok) {
        const data = await resp.json()
        if (data?.success && typeof data.data?.quota === 'number') {
          return { todayUsed: data.data.quota / 500000 }
        }
      }
    }

    // 普通用户：用 /api/log/self/stat
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
    const endOfDay = Math.floor(Date.now() / 1000)
    const statUrl = `${base}/api/log/self/stat?type=2&start_timestamp=${startOfDay}&end_timestamp=${endOfDay}`
    const resp = await fetch(statUrl, { method: 'GET', headers, credentials: 'include' })
    if (resp.ok) {
      const data = await resp.json()
      if (data?.success && typeof data.data?.quota === 'number') {
        return { todayUsed: data.data.quota / 500000 }
      }
    }

    return { todayUsed: null }
  } catch {
    return { todayUsed: null }
  }
}

// =========================================================================
// 多站点余额检查
// =========================================================================

/**
 * 检查单个站点的登录状态（尝试调 API 看是否 401）
 */
async function checkSiteLogin(site) {
  if (!site?.url || (!site?.token && !site?.userId)) {
    return { url: site?.url, loggedIn: false }
  }

  try {
    const url = `${site.url.replace(/\/$/, '')}/api/channel/?p=1&page_size=1`
    const headers = {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    }
    if (site.token) headers['Authorization'] = site.token
    if (site.userId) headers['New-Api-User'] = site.userId

    const resp = await fetch(url, { method: 'GET', headers, credentials: 'include' })
    if (resp.status === 401 || resp.status === 403) {
      return { url: site.url, loggedIn: false }
    }
    return { url: site.url, loggedIn: resp.ok }
  } catch {
    return { url: site.url, loggedIn: false, error: 'network_error' }
  }
}

/**
 * 对单个站点查询余额
 * 根据 platform 字段选择对应的 API：
 * - sub2api: /api/v1/auth/me
 * - new-api (管理员 role >= 10): /api/channel/ 渠道余额
 * - new-api (普通用户): /api/user/self
 */
async function fetchSiteBalances(site) {
  const base = site.url.replace(/\/$/, '')
  let platform = site.platform || ''
  const role = site.role ?? 0
  const headers = {
    Accept: 'application/json',
    'Cache-Control': 'no-store',
  }
  if (site.token) {
    // Sub2API 需要 Bearer 前缀，New API 直接用 token
    headers['Authorization'] = platform === 'sub2api'
      ? `Bearer ${site.token}`
      : site.token
  }
  if (site.userId) headers['New-Api-User'] = site.userId

  // 如果平台未知，尝试自动检测
  if (!platform) {
    try {
      const probeResp = await fetch(`${base}/api/v1/auth/me`, {
        method: 'GET', headers, credentials: 'include'
      })
      if (probeResp.ok) {
        const probeData = await probeResp.json()
        if (probeData?.code === 0 && probeData?.data?.balance !== undefined) {
          platform = 'sub2api'
          // 持久化 platform 到存储
          const stored = await chrome.storage.local.get('balance_sites')
          const sites = stored?.balance_sites || []
          const idx = sites.findIndex(s => s.url === site.url)
          if (idx >= 0) { sites[idx].platform = 'sub2api'; chrome.storage.local.set({ balance_sites: sites }) }
        }
      }
    } catch {}
    if (!platform) platform = 'new-api'
  }

  // Sub2API 站点
  if (platform === 'sub2api') {
    const meUrl = `${base}/api/v1/auth/me`
    const meResp = await fetch(meUrl, { method: 'GET', headers, credentials: 'include' })

    if (meResp.status === 401 || meResp.status === 403) {
      return { url: site.url, loggedIn: false, channels: [] }
    }

    if (!meResp.ok) {
      throw new Error(`HTTP ${meResp.status}`)
    }

    const meData = await meResp.json()
    if (meData?.code !== 0 || !meData?.data) {
      return { url: site.url, loggedIn: false, channels: [] }
    }

    const user = meData.data

    // 查询今日消费
    let todayUsed = null
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
      const statsUrl = `${base}/api/v1/usage/dashboard/stats?timezone=${encodeURIComponent(tz)}`
      const statsResp = await fetch(statsUrl, { method: 'GET', headers, credentials: 'include' })
      if (statsResp.ok) {
        const statsData = await statsResp.json()
        if (statsData?.code === 0 && typeof statsData?.data?.today_actual_cost === 'number') {
          todayUsed = statsData.data.today_actual_cost
        }
      }
    } catch {}

    return {
      url: site.url,
      loggedIn: true,
      userMode: true,
      channels: [{
        id: user.id,
        name: user.display_name || user.username || `用户 #${user.id}`,
        balance: typeof user.balance === 'number' ? user.balance : null,
        todayUsed,
      }],
    }
  }

  // New API 普通用户：从 /api/user/self 获取余额 + 今日消费
  if (role < 10) {
    const selfUrl = `${base}/api/user/self`
    const selfResp = await fetch(selfUrl, { method: 'GET', headers, credentials: 'include' })

    if (selfResp.status === 401 || selfResp.status === 403) {
      return { url: site.url, loggedIn: false, channels: [] }
    }

    if (!selfResp.ok) {
      throw new Error(`HTTP ${selfResp.status}`)
    }

    const selfData = await selfResp.json()
    if (!selfData?.success) {
      return { url: site.url, loggedIn: false, channels: [] }
    }

    const user = selfData.data
    // New API 额度单位：quota / 500000 = 美元
    const quota = typeof user.quota === 'number' ? user.quota / 500000 : null
    const usedQuota = typeof user.used_quota === 'number' ? user.used_quota / 500000 : null

    // 查询今日消费
    let todayUsed = null
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
      const endOfDay = Math.floor(Date.now() / 1000)
      const statUrl = `${base}/api/log/self/stat?type=2&start_timestamp=${startOfDay}&end_timestamp=${endOfDay}`
      const statResp = await fetch(statUrl, { method: 'GET', headers, credentials: 'include' })
      if (statResp.ok) {
        const statData = await statResp.json()
        if (statData?.success && typeof statData.data?.quota === 'number') {
          todayUsed = statData.data.quota / 500000
        }
      }
    } catch {}

    return {
      url: site.url,
      loggedIn: true,
      userMode: true,
      channels: [{
        id: user.id,
        name: user.display_name || user.username || `用户 #${user.id}`,
        balance: quota,
        usedQuota,
        todayUsed,
      }],
    }
  }

  // New API 管理员：查询各渠道余额
  const listUrl = `${base}/api/channel/?p=1&page_size=200`
  const listResp = await fetch(listUrl, { method: 'GET', headers, credentials: 'include' })

  if (listResp.status === 401 || listResp.status === 403) {
    return { url: site.url, loggedIn: false, channels: [] }
  }

  if (!listResp.ok) {
    throw new Error(`HTTP ${listResp.status}`)
  }

  const listData = await listResp.json()
  const items = listData?.data?.items || listData?.data || []

  // 查询每个渠道的余额
  const channels = []
  for (const ch of items) {
    try {
      const balUrl = `${base}/api/channel/update_balance/${ch.id}`
      const balResp = await fetch(balUrl, { method: 'GET', headers, credentials: 'include' })

      if (!balResp.ok) {
        channels.push({ id: ch.id, name: ch.name || `#${ch.id}`, error: `HTTP ${balResp.status}` })
        continue
      }

      const balData = await balResp.json()
      if (balData?.success === false) {
        channels.push({ id: ch.id, name: ch.name || `#${ch.id}`, error: balData.message || '不支持查询' })
      } else {
        const balance = typeof balData.balance === 'number' ? balData.balance : null
        channels.push({ id: ch.id, name: ch.name || `#${ch.id}`, balance })
      }
    } catch (err) {
      channels.push({ id: ch.id, name: ch.name || `#${ch.id}`, error: err.message })
    }
  }

  return { url: site.url, loggedIn: true, channels }
}

/**
 * 遍历所有已配置的站点，逐一查询余额
 */
async function runMultiSiteBalanceCheck() {
  const { balance_sites: sites, balance_config: balConfig } = await chrome.storage.local.get(['balance_sites', 'balance_config'])

  if (!sites?.length) {
    return { success: false, reason: 'no_sites' }
  }

  const threshold = balConfig?.threshold ?? 10
  const results = []
  const lowAlerts = []

  for (const site of sites) {
    try {
      const siteResult = await fetchSiteBalances(site)
      results.push(siteResult)

      if (siteResult.loggedIn) {
        for (const ch of siteResult.channels) {
          if (ch.balance !== null && ch.balance !== undefined && ch.balance < threshold) {
            lowAlerts.push({
              site: site.url,
              channelId: ch.id,
              channelName: ch.name,
              balance: ch.balance,
            })
          }
        }
      }
    } catch (err) {
      results.push({ url: site.url, loggedIn: false, error: err.message, channels: [] })
    }
  }

  // 保存结果
  const lastResult = { results, timestamp: Date.now(), threshold }
  await chrome.storage.local.set({ balance_sites_result: lastResult })

  // 低余额告警
  if (lowAlerts.length > 0) {
    const lines = lowAlerts.slice(0, 5).map(
      (a) => `${a.channelName} (${new URL(a.site).hostname}): $${a.balance.toFixed(2)}`
    )
    const message = lines.join('\n') + (lowAlerts.length > 5 ? `\n... 还有 ${lowAlerts.length - 5} 个` : '')

    chrome.notifications.create('napi-multisite-bal-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `💰 ${lowAlerts.length} 个渠道余额低于 $${threshold}`,
      message,
      priority: 2,
      requireInteraction: true,
    }, () => {})

    await setBadgeAlert(lowAlerts.length)
  }

  return { success: true, results, lowAlerts }
}

// =========================================================================
// 压测引擎 (Benchmark)
// =========================================================================

let activeBenchmark = null
let lastBenchResult = null

const BENCH_KEEPALIVE_ALARM = 'napi-bench-keepalive'

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'bench') return

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'NAPI_BENCH_START') {
      if (activeBenchmark) {
        port.postMessage({ type: 'NAPI_BENCH_ERROR', error: '已有压测正在运行' })
        return
      }
      try {
        await startBenchmark(msg.config, port)
      } catch (err) {
        port.postMessage({ type: 'NAPI_BENCH_ERROR', error: err.message })
        activeBenchmark = null
        chrome.alarms.clear(BENCH_KEEPALIVE_ALARM)
      }
    } else if (msg.type === 'NAPI_BENCH_ABORT') {
      if (activeBenchmark) {
        activeBenchmark.abortController.abort()
      }
    }
  })
})

async function startBenchmark(config, port) {
  const abortController = new AbortController()
  activeBenchmark = { abortController, startTime: Date.now(), config }

  chrome.alarms.create(BENCH_KEEPALIVE_ALARM, { periodInMinutes: 0.4 })

  try {
    const result = await runBenchmark(config, abortController.signal, (progress) => {
      throttledPostMessage(port, { type: 'NAPI_BENCH_PROGRESS', data: progress })
    })
    lastBenchResult = result
    try { port.postMessage({ type: 'NAPI_BENCH_RESULT', data: result }) } catch {}
  } catch (err) {
    if (err.name === 'AbortError' || abortController.signal.aborted) {
      try { port.postMessage({ type: 'NAPI_BENCH_ERROR', error: '压测已终止' }) } catch {}
    } else {
      try { port.postMessage({ type: 'NAPI_BENCH_ERROR', error: err.message }) } catch {}
    }
  } finally {
    activeBenchmark = null
    chrome.alarms.clear(BENCH_KEEPALIVE_ALARM)
  }
}

let _lastProgressSent = 0
function throttledPostMessage(port, msg) {
  const now = Date.now()
  if (now - _lastProgressSent < 200 && msg.data?.completed < msg.data?.total) return
  _lastProgressSent = now
  try { port.postMessage(msg) } catch {}
}

async function runBenchmark(config, signal, onProgress) {
  const { baseURL, apiKey, model, concurrency, totalRequests, apiFormat, stream, prompt, maxTokens } = config
  const latencies = []
  let completed = 0
  let succeeded = 0
  let failed = 0
  const startTime = Date.now()

  let nextIndex = 0
  const inFlight = new Set()

  return new Promise((resolve, reject) => {
    function checkDone() {
      if (completed >= totalRequests) {
        resolve(computeBenchMetrics(latencies, startTime, totalRequests))
      }
    }

    function launchOne() {
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
          latencies.push({ latencyMs: 0, tokens: 0, error: err.message })
          failed++
        })
        .finally(() => {
          completed++
          inFlight.delete(promise)
          onProgress({ completed, succeeded, failed, total: totalRequests, elapsedMs: Date.now() - startTime })

          if (signal.aborted) {
            if (inFlight.size === 0) reject(new DOMException('Aborted', 'AbortError'))
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

async function makeBenchRequest(baseURL, apiKey, model, apiFormat, stream, signal, prompt, maxTokens) {
  const start = Date.now()
  const base = baseURL.replace(/\/+$/, '')
  const userContent = prompt || 'Say hi in one word.'
  const mTokens = maxTokens || 50
  let url, headers, payload

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
  } catch (err) {
    if (err.name === 'AbortError') throw err
    return { latencyMs: Date.now() - start, tokens: 0, error: err.message }
  }
}

async function parseStreamResponse(resp, startTime, apiFormat) {
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let ttftMs = null
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
        } catch {}
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err
  }

  const latencyMs = Date.now() - startTime
  const generationMs = ttftMs !== null ? latencyMs - ttftMs : 0
  const tps = generationMs > 0 ? (tokenCount / (generationMs / 1000)) : 0

  return { latencyMs, tokens: tokenCount, ttftMs: ttftMs || latencyMs, tps, error: null }
}

function computeBenchMetrics(latencies, startTime, totalRequests) {
  const totalDurationMs = Date.now() - startTime
  const successResults = latencies.filter((r) => !r.error)
  const failedResults = latencies.filter((r) => r.error)

  const sortedLatencies = successResults.map((r) => r.latencyMs).sort((a, b) => a - b)

  const percentile = (arr, p) => {
    if (arr.length === 0) return 0
    const idx = Math.ceil((p / 100) * arr.length) - 1
    return arr[Math.max(0, idx)]
  }

  const totalTokens = successResults.reduce((sum, r) => sum + r.tokens, 0)
  const avgLatency =
    sortedLatencies.length > 0 ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length : 0

  const rpm = totalDurationMs > 0 ? totalRequests / (totalDurationMs / 60000) : 0
  const tpm = totalDurationMs > 0 ? totalTokens / (totalDurationMs / 60000) : 0

  const errorMap = {}
  failedResults.forEach((r) => {
    const key = r.error || 'unknown'
    errorMap[key] = (errorMap[key] || 0) + 1
  })
  const errorDetails = Object.entries(errorMap).map(([message, count]) => ({ message, count }))

  const result = {
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

  // 流式模式额外指标：TTFT 和 TPS
  const streamResults = successResults.filter((r) => r.ttftMs !== undefined)
  if (streamResults.length > 0) {
    const sortedTtft = streamResults.map((r) => r.ttftMs).sort((a, b) => a - b)
    const sortedTps = streamResults.map((r) => r.tps).filter((t) => t > 0).sort((a, b) => a - b)

    result.avgTtftMs = Math.round(sortedTtft.reduce((a, b) => a + b, 0) / sortedTtft.length)
    result.p90TtftMs = Math.round(percentile(sortedTtft, 90))
    result.avgTps = sortedTps.length > 0 ? Math.round((sortedTps.reduce((a, b) => a + b, 0) / sortedTps.length) * 10) / 10 : 0
    result.p50Tps = sortedTps.length > 0 ? Math.round(percentile(sortedTps, 50) * 10) / 10 : 0
  }

  return result
}
