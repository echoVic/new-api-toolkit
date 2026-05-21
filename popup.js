/**
 * Popup script - 检测当前页面并显示可用模块状态 + 渠道监控配置
 */
;(function () {
  'use strict'

  // 打开 popup 时清除 Badge（用户已看到告警）
  chrome.action.setBadgeText({ text: '' }).catch(() => {})
  chrome.action.setTitle({ title: 'New API Toolkit' }).catch(() => {})

  const ROLE_ADMIN = 10

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
  // 主站点配置
  // =========================================================================

  const $mainSiteUrl = document.getElementById('main-site-url')
  const $mainSiteSave = document.getElementById('main-site-save')
  const $mainSiteStatus = document.getElementById('main-site-status')

  async function loadMainSite() {
    const { monitor_config: config } = await chrome.storage.local.get('monitor_config')
    if (config?.apiBase) {
      $mainSiteUrl.value = config.apiBase

      // 尝试从已打开的主站点标签页刷新凭据
      try {
        const tabs = await chrome.tabs.query({})
        const match = tabs.find((t) => t.url && t.url.startsWith(config.apiBase))
        if (match) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: match.id },
            world: 'MAIN',
            func: () => {
              const token = localStorage.getItem('token')
                || localStorage.getItem('access_token')
                || localStorage.getItem('session_token')
                || ''
              let userId = '', role = 0
              try {
                const u = JSON.parse(localStorage.getItem('user') || '{}')
                userId = u?.id ? String(u.id) : ''
                role = u?.role ?? 0
              } catch {}
              return { token, userId, role }
            },
          })
          const creds = results?.[0]?.result
          if (creds && (creds.token || creds.userId)) {
            let changed = false
            if (creds.token && creds.token !== config.token) { config.token = creds.token; changed = true }
            if (creds.userId && creds.userId !== config.userId) { config.userId = creds.userId; changed = true }
            if (creds.role !== undefined && creds.role !== config.role) { config.role = creds.role; changed = true }
            const authMode = creds.token ? 'token' : 'cookie'
            if (config.authMode !== authMode) { config.authMode = authMode; changed = true }
            if (changed) {
              await chrome.storage.local.set({ monitor_config: config })
            }
          }
        }
      } catch (err) {
        console.warn('[NAPI] Failed to refresh main site credentials:', err)
      }

      const role = config.role ?? 0
      if (role >= ROLE_ADMIN) {
        $mainSiteStatus.innerHTML = '<span style="color:#16a34a;">已登录（管理员）· 请先访问主站点以保持凭据</span>'
        $mainSiteSave.textContent = '已设置'
        $mainSiteSave.style.background = '#16a34a'
      } else if (config.token) {
        $mainSiteStatus.innerHTML = '<span style="color:#f59e0b;">已登录（非管理员）· 监控功能需要管理员权限</span>'
        $mainSiteSave.textContent = '已设置'
        $mainSiteSave.style.background = '#f59e0b'
      } else {
        $mainSiteStatus.innerHTML = '<span style="color:#9ca3af;">未登录 · 请先访问主站点登录</span>'
      }
    }
  }

  $mainSiteSave.addEventListener('click', async () => {
    let url = $mainSiteUrl.value.trim()
    if (!url) return

    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    url = url.replace(/\/+$/, '')

    try { new URL(url) } catch {
      $mainSiteUrl.style.borderColor = '#ef4444'
      return
    }
    $mainSiteUrl.style.borderColor = '#e2e8f0'

    // 更新 monitor_config 的 apiBase
    const { monitor_config: config } = await chrome.storage.local.get('monitor_config')
    const updated = { ...config, apiBase: url }
    await chrome.storage.local.set({ monitor_config: updated })

    $mainSiteStatus.innerHTML = '<span style="color:#2563eb;">已设置 · 请访问该站点登录以采集凭据</span>'
    $mainSiteSave.textContent = '已设置'
    $mainSiteSave.style.background = '#16a34a'

    // 打开主站点让用户登录
    chrome.tabs.create({ url: url + '/', active: true })
  })

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

  const $tabBtnMonitor = document.getElementById('tab-btn-monitor')
  const $tabBtnBalance = document.getElementById('tab-btn-balance')

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
      $tabBtnBalance.style.display = ''
    } else {
      $tabBtnMonitor.style.display = 'none'
      $tabBtnBalance.style.display = 'none'
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
  // 余额监控（多站点）
  // =========================================================================

  const $balRefreshAll = document.getElementById('bal-refresh-all')
  const $balThreshold = document.getElementById('bal-threshold')
  const $balNewSite = document.getElementById('bal-new-site')
  const $balAddSite = document.getElementById('bal-add-site')
  const $balSitesList = document.getElementById('bal-sites-list')

  // 加载余额配置
  async function loadBalanceConfig() {
    const { balance_config: config } = await chrome.storage.local.get('balance_config')
    if (config?.threshold !== undefined) {
      $balThreshold.value = config.threshold
    }
  }

  // 保存余额阈值
  $balThreshold.addEventListener('change', async () => {
    const { balance_config: config } = await chrome.storage.local.get('balance_config')
    const updated = { ...config, threshold: parseFloat($balThreshold.value) || 10 }
    await chrome.storage.local.set({ balance_config: updated })
  })

  // 添加站点
  $balAddSite.addEventListener('click', async () => {
    let url = $balNewSite.value.trim()
    if (!url) return

    // 自动补 https
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url
    }

    // 只保留 origin（去掉路径、查询参数等）
    try {
      const parsed = new URL(url)
      url = parsed.origin
    } catch {
      $balNewSite.style.borderColor = '#ef4444'
      return
    }
    $balNewSite.style.borderColor = '#e2e8f0'

    const { balance_sites: sites } = await chrome.storage.local.get('balance_sites')
    const list = sites || []

    // 检查重复
    if (list.some((s) => s.url === url)) {
      $balNewSite.value = ''
      $balNewSite.placeholder = '该站点已存在'
      setTimeout(() => { $balNewSite.placeholder = 'https://api.example.com' }, 2000)
      return
    }

    list.push({ url, token: '', userId: '', role: 0 })
    await chrome.storage.local.set({ balance_sites: list })
    $balNewSite.value = ''

    // 打开新标签页让用户去登录
    chrome.tabs.create({ url: url + '/', active: true })

    renderSitesList(list)
  })

  // 渲染站点列表
  function renderSitesList(sites, results) {
    if (!sites?.length) {
      $balSitesList.innerHTML = '<span>暂无站点，请添加 New API 站点地址</span>'
      return
    }

    // 把 results 按 url 索引
    const resultMap = {}
    if (results) {
      for (const r of results) {
        resultMap[r.url] = r
      }
    }

    $balSitesList.innerHTML = ''
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i]
      const result = resultMap[site.url]
      const hasToken = !!site.token
      const hasUserId = !!site.userId
      const loggedIn = result ? result.loggedIn : (hasToken || hasUserId)

      const card = document.createElement('div')
      card.style.cssText = 'padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e5e7eb;'

      // 站点头部：域名 + 状态 + 删除
      let hostname = site.url
      try { hostname = new URL(site.url).hostname } catch {}

      let statusHtml
      if (loggedIn) {
        statusHtml = '<span style="color:#16a34a;font-weight:500;">已登录</span>'
      } else {
        statusHtml = `<a href="#" class="bal-login-link" data-url="${esc(site.url)}" style="color:#2563eb;text-decoration:none;font-weight:500;cursor:pointer;">点击登录</a>`
      }

      card.innerHTML =
        `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">` +
        `<div style="font-weight:500;font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;" title="${esc(site.url)}">${esc(hostname)}</div>` +
        `<div style="display:flex;align-items:center;gap:8px;">` +
        `${statusHtml}` +
        `<button class="bal-remove-site" data-idx="${i}" style="border:none;background:none;color:#9ca3af;cursor:pointer;font-size:14px;line-height:1;padding:0;" title="移除">×</button>` +
        `</div></div>`

      // 余额列表
      if (result?.channels?.length) {
        const threshold = parseFloat($balThreshold.value) || 10

        if (result.userMode) {
          // 普通用户：显示个人余额
          const ch = result.channels[0]
          const bal = ch.balance !== null && ch.balance !== undefined ? ch.balance : null
          if (bal === null) {
            card.innerHTML += `<div style="margin-top:4px;font-size:11px;color:#9ca3af;">余额: 未知</div>`
          } else {
            const low = bal < threshold
            const color = low ? '#ef4444' : '#16a34a'
            const icon = low ? '🔴' : '🟢'
            let line = `${icon} 余额: <strong style="color:${color}">$${bal.toFixed(2)}</strong>`
            if (ch.usedQuota != null) {
              line += ` <span style="color:#6b7280;">(已用 $${ch.usedQuota.toFixed(2)})</span>`
            }
            card.innerHTML += `<div style="margin-top:4px;font-size:11px;">${line}</div>`
          }
        } else {
          // 管理员：显示各渠道余额
          const chLines = result.channels.map((ch) => {
            if (ch.error) {
              return `<div style="padding:1px 0;color:#9ca3af;">  ${esc(ch.name)}: <span style="color:#ef4444;">${esc(ch.error)}</span></div>`
            }
            const bal = ch.balance !== null && ch.balance !== undefined ? ch.balance : null
            if (bal === null) {
              return `<div style="padding:1px 0;color:#9ca3af;">  ${esc(ch.name)}: 未知</div>`
            }
            const low = bal < threshold
            const color = low ? '#ef4444' : '#16a34a'
            const icon = low ? '🔴' : '🟢'
            return `<div style="padding:1px 0;">${icon} ${esc(ch.name)}: <strong style="color:${color}">$${bal.toFixed(2)}</strong></div>`
          })
          card.innerHTML += `<div style="margin-top:4px;font-size:11px;max-height:120px;overflow-y:auto;">${chLines.join('')}</div>`
        }
      } else if (result && !result.loggedIn) {
        card.innerHTML += `<div style="margin-top:4px;font-size:11px;color:#f59e0b;">未登录，无法查询余额</div>`
      } else if (!result && !hasToken && !hasUserId) {
        card.innerHTML += `<div style="margin-top:4px;font-size:11px;color:#9ca3af;">请先登录此站点以采集凭据</div>`
      }

      $balSitesList.appendChild(card)
    }

    // 绑定事件：点击登录
    $balSitesList.querySelectorAll('.bal-login-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault()
        chrome.tabs.create({ url: a.dataset.url + '/', active: true })
      })
    })

    // 绑定事件：移除站点
    $balSitesList.querySelectorAll('.bal-remove-site').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx, 10)
        const { balance_sites: s } = await chrome.storage.local.get('balance_sites')
        if (s) {
          s.splice(idx, 1)
          await chrome.storage.local.set({ balance_sites: s })
          renderSitesList(s)
        }
      })
    })
  }

  // 全部刷新
  $balRefreshAll.addEventListener('click', async () => {
    const { balance_sites: sites } = await chrome.storage.local.get('balance_sites')
    if (!sites?.length) {
      $balSitesList.innerHTML = '<span style="color:#ef4444;">请先添加站点</span>'
      return
    }

    $balRefreshAll.disabled = true
    $balRefreshAll.textContent = '查询中...'

    try {
      const result = await chrome.runtime.sendMessage({ type: 'NAPI_BALANCE_SITES_CHECK' })
      if (!result?.success) {
        $balSitesList.innerHTML = `<span style="color:#ef4444;">查询失败: ${esc(result?.reason || '未知错误')}</span>`
        return
      }
      // 重新加载最新 sites（可能有凭据更新）
      const { balance_sites: updatedSites } = await chrome.storage.local.get('balance_sites')
      renderSitesList(updatedSites || sites, result.results)
    } catch (err) {
      $balSitesList.innerHTML = `<span style="color:#ef4444;">错误: ${esc(err.message)}</span>`
    } finally {
      $balRefreshAll.disabled = false
      $balRefreshAll.textContent = '全部刷新'
    }
  })

  // 加载上次结果（打开 popup 时主动检测各站点登录状态）
  async function loadLastSitesBalance() {
    const { balance_sites: sites, balance_sites_result: data } = await chrome.storage.local.get(['balance_sites', 'balance_sites_result'])
    if (!sites?.length) return

    // 对所有站点，尝试从当前打开的标签页获取最新凭据
    let updated = false
    const tabs = await chrome.tabs.query({})
    for (const site of sites) {
      // 用 origin 匹配标签页（兼容存储的 url 可能带路径的情况）
      let siteOrigin
      try { siteOrigin = new URL(site.url).origin } catch { siteOrigin = site.url }
      const match = tabs.find((t) => {
        if (!t.url) return false
        try { return new URL(t.url).origin === siteOrigin } catch { return false }
      })
      if (match) {
        // 尝试向该标签页注入一次性脚本获取 token（MAIN world 才能读页面 localStorage）
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: match.id },
            world: 'MAIN',
            func: () => {
              const token = localStorage.getItem('token')
                || localStorage.getItem('access_token')
                || localStorage.getItem('session_token')
                || ''
              let userId = '', role = 0
              try {
                const u = JSON.parse(localStorage.getItem('user') || '{}')
                userId = u?.id ? String(u.id) : ''
                role = u?.role ?? 0
              } catch {}
              return { token, userId, role }
            },
          })
          const creds = results?.[0]?.result
          // 有 token 或 userId 变化时都更新（支持 cookie-based 认证）
          if (creds && (creds.token || creds.userId)) {
            const tokenChanged = creds.token && creds.token !== site.token
            const userChanged = creds.userId && creds.userId !== site.userId
            if (tokenChanged || userChanged || site.url !== siteOrigin) {
              if (creds.token) site.token = creds.token
              site.userId = creds.userId
              site.role = creds.role
              site.authMode = creds.token ? 'token' : 'cookie'
              // 修正 url 为 origin
              site.url = siteOrigin
              updated = true
            }
          }
        } catch (err) {
          console.warn('[NAPI] Failed to inject script for', site.url, err)
        }
      }
    }

    if (updated) {
      await chrome.storage.local.set({ balance_sites: sites })
    }

    renderSitesList(sites, data?.results)
  }

  // =========================================================================
  // 初始化
  // =========================================================================

  updateStatus()
  loadMainSite()
  loadMonitorConfig()
  loadBalanceConfig()
  loadLastResult()
  loadLastSitesBalance()
})()
