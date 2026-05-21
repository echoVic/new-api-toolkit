/**
 * New API Toolkit - Background Service Worker
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
  await chrome.action.setTitle({ title: 'New API Toolkit' })
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
