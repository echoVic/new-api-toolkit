/**
 * Popup script - 检测当前页面并显示可用模块状态 + 渠道监控配置
 */
;(function () {
  'use strict'

  // 打开 popup 时清除 Badge（用户已看到告警）
  chrome.action.setBadgeText({ text: '' }).catch(() => {})
  chrome.action.setTitle({ title: 'New API Toolkit' }).catch(() => {})

  // 已注册模块的元信息（与 modules/ 中的注册保持一致）
  const MODULES = [
    {
      id: 'log-export',
      name: '日志导出',
      description: '将使用日志导出为 Excel 文件',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      match(path) {
        return path.includes('/usage-logs/') || path.includes('/console/log')
      },
    },
  ]

  // =========================================================================
  // 模块状态
  // =========================================================================

  async function updateStatus() {
    const pagePathEl = document.getElementById('page-path')
    const moduleListEl = document.getElementById('module-list')

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })

      const path = tab?.url ? new URL(tab.url).pathname : ''
      pagePathEl.textContent = path || '-'
      pagePathEl.title = path || ''

      moduleListEl.innerHTML = ''

      for (const mod of MODULES) {
        const isActive = path ? mod.match(path) : false
        const item = document.createElement('div')
        item.className = `module-item ${isActive ? 'active' : 'inactive'}`
        item.innerHTML = `
          <div class="module-icon">${mod.icon}</div>
          <div class="module-info">
            <div class="module-name">${mod.name}</div>
            <div class="module-desc">${mod.description}</div>
          </div>
          <span class="module-status ${isActive ? 'on' : 'off'}">${isActive ? '已激活' : '未匹配'}</span>
        `
        moduleListEl.appendChild(item)
      }

      if (MODULES.length === 0) {
        moduleListEl.innerHTML = '<div style="color:#999;font-size:12px;padding:8px 0;">暂无已注册模块</div>'
      }
    } catch (err) {
      console.error('Status check failed:', err)
      pagePathEl.textContent = '检测失败'
      moduleListEl.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:8px 0;">无法检测当前页面</div>'
    }
  }

  // =========================================================================
  // 渠道监控配置
  // =========================================================================

  const $apiBase = document.getElementById('mon-api-base')
  const $token = document.getElementById('mon-token')
  const $userId = document.getElementById('mon-user-id')
  const $threshold = document.getElementById('mon-threshold')
  const $interval = document.getElementById('mon-interval')
  const $window = document.getElementById('mon-window')
  const $channels = document.getElementById('mon-channels')
  const $save = document.getElementById('mon-save')
  const $disable = document.getElementById('mon-disable')
  const $check = document.getElementById('mon-check')
  const $status = document.getElementById('monitor-status')

  const ROLE_ADMIN = 10
  const $tabBtnMonitor = document.getElementById('tab-btn-monitor')

  // =========================================================================
  // Tab 切换
  // =========================================================================

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('panel-' + btn.dataset.tab)?.classList.add('active')
    })
  })

  // 加载已有配置
  async function loadMonitorConfig() {
    const { monitor_config: config } = await chrome.storage.local.get('monitor_config')
    if (!config) return

    // 检查是否为管理员 — 显示/隐藏监控 Tab
    const role = config.role ?? 0
    if (role >= ROLE_ADMIN) {
      $tabBtnMonitor.style.display = ''
    } else {
      $tabBtnMonitor.style.display = 'none'
      return
    }

    $apiBase.value = config.apiBase || ''
    $token.value = config.token || ''
    $userId.value = config.userId || ''
    $threshold.value = config.threshold ?? 20
    $interval.value = config.intervalMinutes ?? 5
    $window.value = config.windowMinutes ?? 5

    if (config.channels?.length) {
      $channels.value = config.channels.map((ch) => ch.id).join(', ')
    }

    if (config.enabled) {
      $save.textContent = '已启用 · 更新配置'
      $save.style.background = '#16a34a'
    }

    // 显示自动检测提示
    if (config.apiBase || config.token || config.userId) {
      document.getElementById('mon-auto-hint').style.display = 'block'
    }
  }

  // 解析渠道 ID 列表（支持逗号、换行、空格分隔）
  function parseChannelIds(text) {
    return [...new Set(
      text
        .split(/[\s,;，；\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n) && n > 0)
    )]
  }

  // 通过 API 批量获取渠道名称
  async function fetchChannelNames(config, ids) {
    const names = {}
    try {
      const url = `${config.apiBase.replace(/\/$/, '')}/api/channel/?p=1&page_size=100`
      const headers = { Accept: 'application/json' }
      if (config.token) headers['Authorization'] = config.token
      if (config.userId) headers['New-Api-User'] = config.userId

      const resp = await fetch(url, { method: 'GET', headers })
      if (resp.ok) {
        const data = await resp.json()
        const items = data?.data?.items || data?.data || []
        for (const ch of items) {
          if (ch.id && ids.includes(ch.id)) {
            names[ch.id] = ch.name || `Channel #${ch.id}`
          }
        }
      }
    } catch (err) {
      console.warn('[NAPI Monitor] Failed to fetch channel names:', err)
    }
    return names
  }

  // 保存并启用
  $save.addEventListener('click', async () => {
    const ids = parseChannelIds($channels.value)
    if (ids.length === 0) {
      $status.innerHTML = '<span style="color:#ef4444;">请至少填写一个渠道 ID</span>'
      return
    }

    // 读取已有配置（可能含自动采集的凭据）
    const { monitor_config: existing } = await chrome.storage.local.get('monitor_config')

    const config = {
      ...existing,
      enabled: true,
      apiBase: $apiBase.value.trim() || existing?.apiBase || '',
      token: $token.value.trim() || existing?.token || '',
      userId: $userId.value.trim() || existing?.userId || '',
      threshold: parseFloat($threshold.value) || 20,
      intervalMinutes: parseInt($interval.value, 10) || 5,
      windowMinutes: parseInt($window.value, 10) || 5,
    }

    if (!config.apiBase) {
      $status.innerHTML = '<span style="color:#ef4444;">未检测到 API 地址，请先打开 New API 页面或手动填写（高级设置）</span>'
      return
    }

    // 尝试拉取渠道名称
    $status.innerHTML = '<span style="color:#2563eb;">正在获取渠道信息...</span>'
    const names = await fetchChannelNames(config, ids)
    config.channels = ids.map((id) => ({ id, name: names[id] || `Channel #${id}` }))

    await chrome.storage.local.set({ monitor_config: config })

    $save.textContent = '已启用 · 更新配置'
    $save.style.background = '#16a34a'
    $status.innerHTML = `<span style="color:#16a34a;">已保存，监控 ${config.channels.length} 个渠道，每 ${config.intervalMinutes} 分钟检查</span>`
  })

  // 停用
  $disable.addEventListener('click', async () => {
    const { monitor_config: config } = await chrome.storage.local.get('monitor_config')
    if (config) {
      config.enabled = false
      await chrome.storage.local.set({ monitor_config: config })
    }
    $save.textContent = '保存并启用'
    $save.style.background = '#2563eb'
    $status.innerHTML = '<span style="color:#9ca3af;">监控已停用</span>'
  })

  // 立即检查（自动先保存）
  $check.addEventListener('click', async () => {
    // 先触发保存流程
    const ids = parseChannelIds($channels.value)
    if (ids.length === 0) {
      $status.innerHTML = '<span style="color:#ef4444;">请至少填写一个渠道 ID</span>'
      return
    }

    const { monitor_config: existing } = await chrome.storage.local.get('monitor_config')
    const config = {
      ...existing,
      enabled: true,
      apiBase: $apiBase.value.trim() || existing?.apiBase || '',
      token: $token.value.trim() || existing?.token || '',
      userId: $userId.value.trim() || existing?.userId || '',
      threshold: parseFloat($threshold.value) || 20,
      intervalMinutes: parseInt($interval.value, 10) || 5,
      windowMinutes: parseInt($window.value, 10) || 5,
    }

    if (!config.apiBase) {
      $status.innerHTML = '<span style="color:#ef4444;">未检测到 API 地址，请先打开 New API 页面或手动填写（高级设置）</span>'
      return
    }

    $status.innerHTML = '<span style="color:#2563eb;">正在保存并检查...</span>'
    const names = await fetchChannelNames(config, ids)
    config.channels = ids.map((id) => ({ id, name: names[id] || `Channel #${id}` }))
    await chrome.storage.local.set({ monitor_config: config })

    $save.textContent = '已启用 · 更新配置'
    $save.style.background = '#16a34a'

    // 执行检查
    try {
      const result = await chrome.runtime.sendMessage({ type: 'NAPI_MONITOR_CHECK_NOW' })
      if (!result?.success) {
        $status.innerHTML = `<span style="color:#ef4444;">检查失败: ${result?.reason || '未知错误'}</span>`
        return
      }
      renderLastResult(result)
    } catch (err) {
      $status.innerHTML = `<span style="color:#ef4444;">错误: ${err.message}</span>`
    }
  })

  // 渲染最近结果
  function renderLastResult(data) {
    if (!data?.results?.length) {
      $status.innerHTML = '<span style="color:#9ca3af;">暂无检查结果</span>'
      return
    }

    const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString('zh-CN') : ''
    const lines = data.results.map((r) => {
      if (r.error) {
        return `<div style="padding:2px 0;"><span style="color:#ef4444;">⚠</span> ${esc(r.channelName)}: ${esc(r.error)}</div>`
      }
      const color = r.exceeded ? '#ef4444' : '#16a34a'
      const icon = r.exceeded ? '🔴' : '🟢'
      return `<div style="padding:2px 0;">${icon} ${esc(r.channelName)}: <strong style="color:${color}">${r.errorRate}%</strong> <span style="color:#999;">(${r.errorCount}/${r.totalCount})</span></div>`
    })

    $status.innerHTML =
      `<div style="color:#999;margin-bottom:4px;">最近检查: ${time} · 窗口 ${data.windowMinutes || '?'} 分钟 · 阈值 ${data.threshold || '?'}%</div>` +
      lines.join('') +
      (data.notifyResult
        ? data.notifyResult.sent
          ? '<div style="color:#16a34a;margin-top:4px;font-size:10px;">✅ 已发送系统通知</div>'
          : `<div style="color:#ef4444;margin-top:4px;font-size:10px;">❌ 通知发送失败: ${esc(data.notifyResult.error)}</div>`
        : data.alerts?.length > 0
          ? '<div style="color:#f59e0b;margin-top:4px;font-size:10px;">⚠ 有告警但未发送通知</div>'
          : ''
      )
  }

  function esc(s) {
    const el = document.createElement('span')
    el.textContent = s || ''
    return el.innerHTML
  }

  // 加载最近检查结果
  async function loadLastResult() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'NAPI_MONITOR_GET_STATUS' })
      if (result) {
        renderLastResult(result)
      }
    } catch {}
  }

  // =========================================================================
  // 初始化
  // =========================================================================

  updateStatus()
  loadMonitorConfig()
  loadLastResult()
})()
