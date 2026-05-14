/**
 * Popup script - 检测当前页面并显示可用模块状态
 */
;(function () {
  'use strict'

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
    {
      id: 'api-client',
      name: 'API Client',
      description: '通用 API 请求工具，自动注入 Cookie & Token',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
      match() {
        return true // 所有页面激活
      },
    },
  ]

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

  updateStatus()
})()
