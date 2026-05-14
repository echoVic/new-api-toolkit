/**
 * New API Toolkit - Module: Log Export
 *
 * 将使用日志导出为 Excel 文件。
 * 支持 default 前端 (/usage-logs/*) 和 classic 前端 (/console/log)。
 *
 * 依赖: lib/xlsx.full.min.js, content.js (模块加载器)
 */
;(function () {
  'use strict'

  // =========================================================================
  // 常量
  // =========================================================================

  const MODULE_ID = 'log-export'
  const EXPORT_BTN_ID = 'napi-export-excel-btn'
  const PAGE_SIZE = 100
  const MAX_PAGES = 200
  const POLL_INTERVAL = 2000

  const LOG_TYPE_LABELS = {
    0: 'All',
    1: 'Top-up',
    2: 'Consume',
    3: 'Manage',
    4: 'System',
    5: 'Error',
    6: 'Refund',
  }

  // =========================================================================
  // 筛选条件读取 —— default 前端（从 URL search params）
  // =========================================================================

  function getFiltersFromURL() {
    const params = new URLSearchParams(window.location.search)
    const filters = {}

    const startTime = params.get('startTime')
    const endTime = params.get('endTime')
    if (startTime) filters.start_timestamp = Math.floor(Number(startTime) / 1000)
    if (endTime) filters.end_timestamp = Math.floor(Number(endTime) / 1000)

    const model = params.get('model')
    const token = params.get('token')
    const group = params.get('group')
    const username = params.get('username')
    const channel = params.get('channel')
    const requestId = params.get('requestId')
    const upstreamRequestId = params.get('upstreamRequestId')

    if (model) filters.model_name = model
    if (token) filters.token_name = token
    if (group) filters.group = group
    if (username) filters.username = username
    if (channel) filters.channel = Number(channel)
    if (requestId) filters.request_id = requestId
    if (upstreamRequestId) filters.upstream_request_id = upstreamRequestId

    const types = params.getAll('type')
    if (types.length === 1) filters.type = Number(types[0])

    return filters
  }

  // =========================================================================
  // 筛选条件读取 —— classic 前端（从 DOM input 元素）
  // =========================================================================

  function getFiltersFromDOM() {
    const filters = {}

    const dateInputs = document.querySelectorAll('input[placeholder*="时间"], input[placeholder*="Start"], input[placeholder*="End"]')
    const dateValues = []
    dateInputs.forEach((input) => {
      const val = input.value?.trim()
      if (val) dateValues.push(val)
    })

    if (dateValues.length < 2) {
      const allInputs = document.querySelectorAll('.semi-datepicker input, .semi-input input, input[type="text"]')
      allInputs.forEach((input) => {
        const val = input.value?.trim()
        if (val && /^\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}/.test(val)) {
          dateValues.push(val)
        }
      })
    }

    if (dateValues.length >= 2) {
      const startTs = Date.parse(dateValues[0])
      const endTs = Date.parse(dateValues[1])
      if (!isNaN(startTs)) filters.start_timestamp = Math.floor(startTs / 1000)
      if (!isNaN(endTs)) filters.end_timestamp = Math.floor(endTs / 1000)
    }

    const placeholderMap = {
      '令牌名称': 'token_name',
      'Token Name': 'token_name',
      '模型名称': 'model_name',
      'Model Name': 'model_name',
      '分组': 'group',
      'Group': 'group',
      '用户名称': 'username',
      'Username': 'username',
      '渠道 ID': 'channel',
      'Channel ID': 'channel',
      'Request ID': 'request_id',
    }

    document.querySelectorAll('input[placeholder]').forEach((input) => {
      const placeholder = input.getAttribute('placeholder') || ''
      const val = input.value?.trim()
      if (!val) return

      for (const [ph, field] of Object.entries(placeholderMap)) {
        if (placeholder.includes(ph)) {
          filters[field] = field === 'channel' ? Number(val) : val
          break
        }
      }
    })

    const selectTriggers = document.querySelectorAll('.semi-select-selection-text')
    selectTriggers.forEach((el) => {
      const text = el.textContent?.trim()
      for (const [value, label] of Object.entries(LOG_TYPE_LABELS)) {
        if (text === label || text === `类型 ${value}`) {
          if (Number(value) !== 0) {
            filters.type = Number(value)
          }
          break
        }
      }
    })

    return filters
  }

  // =========================================================================
  // 工具函数
  // =========================================================================

  function getLogCategory() {
    const path = window.location.pathname
    if (path.includes('/usage-logs/drawing')) return 'drawing'
    if (path.includes('/usage-logs/task')) return 'task'
    return 'common'
  }

  function isAdmin() {
    const inputs = document.querySelectorAll('input[placeholder]')
    for (const input of inputs) {
      const placeholder = input.getAttribute('placeholder') || ''
      if (
        placeholder.includes('Channel ID') ||
        placeholder.includes('渠道 ID') ||
        placeholder.includes('Username') ||
        placeholder.includes('用户名称')
      ) {
        return true
      }
    }
    return false
  }

  function buildApiURL(category, page, pageSize, filters, admin) {
    const endpointMap = {
      common: '/api/log',
      drawing: '/api/mj',
      task: '/api/task',
    }
    const base = endpointMap[category] || '/api/log'
    const path = admin ? base : `${base}/self`

    const params = new URLSearchParams()
    params.set('p', String(page))
    params.set('page_size', String(pageSize))

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    })

    return `${path}?${params.toString()}`
  }

  function formatTimestamp(ts) {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  function formatQuota(quota) {
    if (!quota) return '$0'
    return `$${(quota / 500000).toFixed(6)}`
  }

  // =========================================================================
  // 数据拉取
  // =========================================================================

  async function fetchAllLogs(frontend, onProgress) {
    const category = getLogCategory()
    const filters =
      frontend === 'default' ? getFiltersFromURL() : getFiltersFromDOM()
    const admin = isAdmin()

    if (!filters.start_timestamp) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      filters.start_timestamp = Math.floor(today.getTime() / 1000)
    }
    if (!filters.end_timestamp) {
      filters.end_timestamp = Math.floor((Date.now() + 3600000) / 1000)
    }

    if (category === 'drawing') {
      filters.start_timestamp = filters.start_timestamp * 1000
      filters.end_timestamp = filters.end_timestamp * 1000
    }

    const allItems = []
    let page = 1
    let totalCount = 0

    while (page <= MAX_PAGES) {
      const url = buildApiURL(category, page, PAGE_SIZE, filters, admin)
      const result = await window.__NAPI_FETCH(url)

      if (!result.success) {
        throw new Error(result.message || 'API request failed')
      }

      const data = result.data
      if (!data || !data.items || data.items.length === 0) break

      allItems.push(...data.items)
      totalCount = data.total || totalCount

      onProgress(allItems.length, totalCount)

      if (allItems.length >= totalCount) break
      page++

      await new Promise((r) => setTimeout(r, 100))
    }

    return { items: allItems, total: totalCount, category }
  }

  // =========================================================================
  // Excel 生成
  // =========================================================================

  function parseOther(otherStr) {
    if (!otherStr) return null
    try {
      return JSON.parse(otherStr)
    } catch {
      return null
    }
  }

  function commonLogToRow(log) {
    const other = parseOther(log.other)
    return {
      ID: log.id,
      '时间': formatTimestamp(log.created_at),
      '类型': LOG_TYPE_LABELS[log.type] || String(log.type),
      '用户名': log.username || '',
      '用户 ID': log.user_id,
      '令牌名': log.token_name || '',
      '模型': log.model_name || '',
      '额度': log.quota || 0,
      '额度 ($)': formatQuota(log.quota),
      '输入 Tokens': log.prompt_tokens || 0,
      '输出 Tokens': log.completion_tokens || 0,
      '请求耗时 (s)': log.use_time || 0,
      '流式': log.is_stream ? 'Yes' : 'No',
      '分组': log.group || '',
      '渠道 ID': log.channel || '',
      '渠道名': log.channel_name || '',
      'Request ID': log.request_id || '',
      'Upstream Request ID': log.upstream_request_id || '',
      'IP': log.ip || '',
      '内容': log.content || '',
      '模型倍率': other?.model_ratio ?? '',
      '补全倍率': other?.completion_ratio ?? '',
      '分组倍率': other?.group_ratio ?? '',
      '缓存 Tokens': other?.cache_tokens ?? '',
    }
  }

  function drawingLogToRow(log) {
    return {
      ID: log.id,
      'MJ ID': log.mj_id || '',
      '用户 ID': log.user_id,
      '渠道 ID': log.channel_id || '',
      '动作': log.action || '',
      '状态': log.status || '',
      '进度': log.progress || '',
      '提示词': log.prompt || '',
      '提示词 (EN)': log.prompt_en || '',
      '失败原因': log.fail_reason || '',
      '提交时间': formatTimestamp(log.submit_time ? log.submit_time / 1000 : 0),
      '完成时间': formatTimestamp(log.finish_time ? log.finish_time / 1000 : 0),
      '图片 URL': log.image_url || '',
    }
  }

  function taskLogToRow(log) {
    return {
      ID: log.id,
      'Task ID': log.task_id || '',
      '用户 ID': log.user_id,
      '用户名': log.username || '',
      '渠道 ID': log.channel_id || '',
      '平台': log.platform || '',
      '动作': log.action || '',
      '状态': log.status || '',
      '进度': log.progress || '',
      '失败原因': log.fail_reason || '',
      '提交时间': formatTimestamp(log.submit_time),
      '完成时间': formatTimestamp(log.finish_time),
    }
  }

  function generateExcel(items, category) {
    const rowMapper = {
      common: commonLogToRow,
      drawing: drawingLogToRow,
      task: taskLogToRow,
    }
    const mapper = rowMapper[category] || commonLogToRow
    const rows = items.map(mapper)

    const ws = XLSX.utils.json_to_sheet(rows)

    const colKeys = rows.length > 0 ? Object.keys(rows[0]) : []
    ws['!cols'] = colKeys.map((key) => {
      let maxLen = key.length
      for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const val = String(rows[i][key] ?? '')
        if (val.length > maxLen) maxLen = val.length
      }
      return { wch: Math.min(maxLen + 2, 60) }
    })

    const wb = XLSX.utils.book_new()
    const sheetName = {
      common: 'Usage Logs',
      drawing: 'Drawing Logs',
      task: 'Task Logs',
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName[category] || 'Logs')

    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const fileName = `usage_logs_${category}_${dateStr}.xlsx`

    XLSX.writeFile(wb, fileName)
    return fileName
  }

  // =========================================================================
  // UI
  // =========================================================================

  const DOWNLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`

  let currentFrontend = null

  async function handleExport() {
    const btn = document.getElementById(EXPORT_BTN_ID)
    if (btn) btn.disabled = true
    const ui = window.__NAPI_UI

    try {
      ui.showProgress('正在拉取数据…')

      const { items, total, category } = await fetchAllLogs(
        currentFrontend,
        (fetched, totalCount) => {
          ui.showProgress(`正在拉取数据… ${fetched} / ${totalCount}`)
        }
      )

      if (items.length === 0) {
        ui.showProgress('没有数据可导出', 'error')
        setTimeout(() => ui.hideProgress(), 2500)
        return
      }

      ui.showProgress(`正在生成 Excel… (${items.length} 条记录)`)
      const fileName = generateExcel(items, category)
      ui.showProgress(`✓ 导出完成: ${fileName} (${items.length} 条)`, 'done')
      setTimeout(() => ui.hideProgress(), 3500)
    } catch (err) {
      console.error('[NAPI Log Export]', err)
      ui.showProgress(`导出失败: ${err.message}`, 'error')
      setTimeout(() => ui.hideProgress(), 4000)
    } finally {
      if (btn) btn.disabled = false
    }
  }

  function createExportButton() {
    const btn = document.createElement('button')
    btn.id = EXPORT_BTN_ID
    btn.className = 'napi-export-btn'
    btn.type = 'button'
    btn.innerHTML = `${DOWNLOAD_ICON}<span>导出 Excel</span>`
    btn.addEventListener('click', handleExport)
    return btn
  }

  // =========================================================================
  // 注入逻辑
  // =========================================================================

  let retryCount = 0
  const MAX_RETRIES = 15

  function injectButton(frontend) {
    if (document.getElementById(EXPORT_BTN_ID)) return true

    if (frontend === 'default') {
      return injectToDefaultUI()
    } else if (frontend === 'classic') {
      return injectToClassicUI()
    }
    return false
  }

  function injectToDefaultUI() {
    const eyeBtn = document.querySelector(
      'button[aria-label="Hide"], button[aria-label="Show"], button[aria-label="隐藏"], button[aria-label="显示"]'
    )
    if (eyeBtn) {
      const container = eyeBtn.closest('[class*="flex"][class*="items-center"]')
      if (container) {
        container.appendChild(createExportButton())
        return true
      }
    }
    return false
  }

  function injectToClassicUI() {
    const semiButtons = document.querySelectorAll('button.semi-button, button[class*="semi-button"]')
    for (const button of semiButtons) {
      const text = button.textContent?.trim() || ''
      if (
        text.includes('紧凑列表') ||
        text.includes('自适应列表') ||
        text.includes('Compact') ||
        text.includes('Adaptive')
      ) {
        const container = button.parentElement
        if (container) {
          container.appendChild(createExportButton())
          return true
        }
      }
    }

    const allElements = document.querySelectorAll('.semi-tag, [class*="semi-tag"]')
    for (const el of allElements) {
      const text = el.textContent || ''
      if (text.includes('RPM') || text.includes('TPM')) {
        let parent = el.parentElement
        for (let i = 0; i < 10 && parent; i++) {
          const cls = parent.className || ''
          if (cls.includes('justify-between') && cls.includes('flex')) {
            parent.appendChild(createExportButton())
            return true
          }
          parent = parent.parentElement
        }
      }
    }

    const allButtons = document.querySelectorAll('button')
    for (const button of allButtons) {
      const text = button.textContent?.trim() || ''
      if (text.includes('列设置') || text.includes('Column Settings')) {
        const container = button.parentElement
        if (container) {
          container.appendChild(createExportButton())
          return true
        }
      }
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.textContent?.includes('RPM:')) {
        let parent = node.parentElement
        for (let i = 0; i < 8 && parent; i++) {
          const cls = parent.className || ''
          if ((cls.includes('flex') && cls.includes('w-full')) || cls.includes('justify-between')) {
            parent.appendChild(createExportButton())
            return true
          }
          parent = parent.parentElement
        }
      }
    }

    return false
  }

  // =========================================================================
  // 模块注册
  // =========================================================================

  function tryInject(frontend) {
    if (injectButton(frontend)) {
      console.log(`[NAPI Log Export] Button injected (${frontend} frontend)`)
      return
    }
    retryCount++
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => tryInject(frontend), POLL_INTERVAL)
    } else {
      console.warn('[NAPI Log Export] Injection point not found, giving up')
    }
  }

  window.__NAPI_MODULES.push({
    id: MODULE_ID,
    name: '日志导出',
    description: '将使用日志导出为 Excel 文件',
    icon: DOWNLOAD_ICON,

    match(ctx) {
      return ctx.path.includes('/usage-logs/') || ctx.path.includes('/console/log')
    },

    init(ctx) {
      currentFrontend = ctx.frontend
      retryCount = 0
      tryInject(ctx.frontend)
    },

    destroy() {
      const btn = document.getElementById(EXPORT_BTN_ID)
      if (btn) btn.remove()
      currentFrontend = null
      retryCount = MAX_RETRIES // 停止重试
    },
  })
})()
