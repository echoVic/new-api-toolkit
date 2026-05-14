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
  }
})

// 支持从 popup 手动触发一次检查
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'NAPI_MONITOR_CHECK_NOW') {
    runMonitorCheck().then(sendResponse)
    return true // 异步响应
  }
  if (msg.type === 'NAPI_MONITOR_GET_STATUS') {
    chrome.storage.local.get('monitor_last_result', (data) => {
      sendResponse(data.monitor_last_result || null)
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
// Chrome 通知
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
