/**
 * New API Toolkit - Module: API Client
 *
 * 在任意 New API 页面提供一个浮动 API 请求面板。
 * 自动注入 Cookie (credentials: include) 和 Token (localStorage)。
 * 支持 GET / POST / PUT / PATCH / DELETE，JSON body 编辑，响应查看。
 */
;(function () {
  'use strict'

  const MODULE_ID = 'api-client'
  const PANEL_ID = 'napi-api-client-panel'
  const FAB_ID = 'napi-api-client-fab'

  const API_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`

  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

  const METHOD_COLORS = {
    GET: '#16a34a',
    POST: '#2563eb',
    PUT: '#d97706',
    PATCH: '#8b5cf6',
    DELETE: '#dc2626',
  }

  let panelVisible = false

  // =========================================================================
  // 面板 HTML
  // =========================================================================

  function buildPanelHTML() {
    const methodOptions = METHODS.map(
      (m) => `<option value="${m}" ${m === 'GET' ? 'selected' : ''}>${m}</option>`
    ).join('')

    return `
      <div class="napi-ac-header">
        <span class="napi-ac-title">${API_ICON} API Client</span>
        <div class="napi-ac-header-actions">
          <button class="napi-ac-btn-icon" id="napi-ac-clear" title="清空">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
          <button class="napi-ac-btn-icon" id="napi-ac-close" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="napi-ac-body">
        <div class="napi-ac-url-row">
          <select id="napi-ac-method" class="napi-ac-method">${methodOptions}</select>
          <input id="napi-ac-url" class="napi-ac-url" type="text" placeholder="/api/..." value="/api/" spellcheck="false" />
          <button id="napi-ac-send" class="napi-ac-send">Send</button>
        </div>
        <div class="napi-ac-section" id="napi-ac-headers-section">
          <div class="napi-ac-section-label">Headers <span class="napi-ac-hint">(自动注入 Cookie & Token)</span></div>
          <textarea id="napi-ac-headers" class="napi-ac-textarea" rows="2" placeholder='{"X-Custom": "value"}' spellcheck="false"></textarea>
        </div>
        <div class="napi-ac-section" id="napi-ac-body-section">
          <div class="napi-ac-section-label">Body <span class="napi-ac-hint">(JSON)</span></div>
          <textarea id="napi-ac-body" class="napi-ac-textarea" rows="4" placeholder='{"key": "value"}' spellcheck="false"></textarea>
        </div>
        <div class="napi-ac-section">
          <div class="napi-ac-section-label">Response <span id="napi-ac-status" class="napi-ac-status"></span></div>
          <div class="napi-ac-response-meta" id="napi-ac-resp-meta" style="display:none;">
            <span id="napi-ac-resp-time"></span>
            <span id="napi-ac-resp-size"></span>
          </div>
          <pre id="napi-ac-response" class="napi-ac-response">点击 Send 发送请求</pre>
        </div>
      </div>
    `
  }

  // =========================================================================
  // 面板逻辑
  // =========================================================================

  function createPanel() {
    const panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.className = 'napi-ac-panel'
    panel.innerHTML = buildPanelHTML()
    document.body.appendChild(panel)

    // 绑定事件
    panel.querySelector('#napi-ac-close').addEventListener('click', togglePanel)
    panel.querySelector('#napi-ac-clear').addEventListener('click', clearForm)
    panel.querySelector('#napi-ac-send').addEventListener('click', sendRequest)

    // Enter 快捷键发送
    panel.querySelector('#napi-ac-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendRequest()
      }
    })

    // method 切换时更新 body 区域显示
    const methodSelect = panel.querySelector('#napi-ac-method')
    methodSelect.addEventListener('change', () => {
      updateBodyVisibility(methodSelect.value)
      updateMethodColor(methodSelect.value)
    })
    updateBodyVisibility('GET')
    updateMethodColor('GET')

    // 拖拽支持
    makeDraggable(panel, panel.querySelector('.napi-ac-header'))

    return panel
  }

  function updateBodyVisibility(method) {
    const bodySection = document.getElementById('napi-ac-body-section')
    if (bodySection) {
      bodySection.style.display = method === 'GET' || method === 'DELETE' ? 'none' : 'block'
    }
  }

  function updateMethodColor(method) {
    const select = document.getElementById('napi-ac-method')
    if (select) {
      select.style.color = METHOD_COLORS[method] || '#333'
    }
  }

  function clearForm() {
    const url = document.getElementById('napi-ac-url')
    const headers = document.getElementById('napi-ac-headers')
    const body = document.getElementById('napi-ac-body')
    const response = document.getElementById('napi-ac-response')
    const status = document.getElementById('napi-ac-status')
    const meta = document.getElementById('napi-ac-resp-meta')
    const method = document.getElementById('napi-ac-method')

    if (url) url.value = '/api/'
    if (headers) headers.value = ''
    if (body) body.value = ''
    if (response) { response.textContent = '点击 Send 发送请求'; response.className = 'napi-ac-response' }
    if (status) { status.textContent = ''; status.className = 'napi-ac-status' }
    if (meta) meta.style.display = 'none'
    if (method) { method.value = 'GET'; updateBodyVisibility('GET'); updateMethodColor('GET') }
  }

  async function sendRequest() {
    const sendBtn = document.getElementById('napi-ac-send')
    const responseEl = document.getElementById('napi-ac-response')
    const statusEl = document.getElementById('napi-ac-status')
    const metaEl = document.getElementById('napi-ac-resp-meta')
    const timeEl = document.getElementById('napi-ac-resp-time')
    const sizeEl = document.getElementById('napi-ac-resp-size')

    const method = document.getElementById('napi-ac-method').value
    const url = document.getElementById('napi-ac-url').value.trim()
    const headersStr = document.getElementById('napi-ac-headers').value.trim()
    const bodyStr = document.getElementById('napi-ac-body').value.trim()

    if (!url) {
      responseEl.textContent = '请输入请求 URL'
      responseEl.className = 'napi-ac-response napi-ac-resp-error'
      return
    }

    // 解析自定义 headers
    let extraHeaders = {}
    if (headersStr) {
      try {
        extraHeaders = JSON.parse(headersStr)
      } catch (e) {
        responseEl.textContent = `Headers JSON 解析失败: ${e.message}`
        responseEl.className = 'napi-ac-response napi-ac-resp-error'
        return
      }
    }

    // 解析 body
    let bodyPayload
    if (bodyStr && !['GET', 'DELETE'].includes(method)) {
      try {
        bodyPayload = JSON.parse(bodyStr)
      } catch {
        // 非 JSON 时按原文发送
        bodyPayload = bodyStr
      }
    }

    sendBtn.disabled = true
    sendBtn.textContent = '...'
    responseEl.textContent = '请求中…'
    responseEl.className = 'napi-ac-response'
    statusEl.textContent = ''
    statusEl.className = 'napi-ac-status'
    metaEl.style.display = 'none'

    const startTime = performance.now()

    try {
      const { result, meta } = await window.__NAPI_FETCH(url, {
        method,
        headers: extraHeaders,
        body: bodyPayload,
        raw: true,
        timeout: 30000,
      })

      const elapsed = Math.round(performance.now() - startTime)
      const formatted = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)

      // 状态
      statusEl.textContent = `${meta.status} ${meta.statusText}`
      statusEl.className = 'napi-ac-status ' +
        (meta.status >= 200 && meta.status < 300 ? 'napi-ac-status-ok' :
         meta.status >= 400 ? 'napi-ac-status-err' : 'napi-ac-status-warn')

      // Meta
      metaEl.style.display = 'flex'
      timeEl.textContent = `${elapsed}ms`
      const sizeBytes = new Blob([formatted]).size
      sizeEl.textContent = sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`

      // Response body
      responseEl.textContent = formatted
      responseEl.className = 'napi-ac-response'
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime)
      statusEl.textContent = 'Error'
      statusEl.className = 'napi-ac-status napi-ac-status-err'
      metaEl.style.display = 'flex'
      timeEl.textContent = `${elapsed}ms`
      sizeEl.textContent = ''
      responseEl.textContent = err.message
      responseEl.className = 'napi-ac-response napi-ac-resp-error'
    } finally {
      sendBtn.disabled = false
      sendBtn.textContent = 'Send'
    }
  }

  // =========================================================================
  // FAB (Floating Action Button)
  // =========================================================================

  function createFAB() {
    const fab = document.createElement('button')
    fab.id = FAB_ID
    fab.className = 'napi-ac-fab'
    fab.title = 'API Client'
    fab.innerHTML = API_ICON
    fab.addEventListener('click', togglePanel)
    document.body.appendChild(fab)
    return fab
  }

  function togglePanel() {
    panelVisible = !panelVisible
    const panel = document.getElementById(PANEL_ID)
    if (panel) {
      panel.style.display = panelVisible ? 'flex' : 'none'
    }
  }

  // =========================================================================
  // 拖拽
  // =========================================================================

  function makeDraggable(el, handle) {
    let isDragging = false
    let startX, startY, origX, origY

    handle.style.cursor = 'grab'

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return
      isDragging = true
      handle.style.cursor = 'grabbing'
      startX = e.clientX
      startY = e.clientY
      const rect = el.getBoundingClientRect()
      origX = rect.left
      origY = rect.top
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      el.style.left = `${origX + dx}px`
      el.style.top = `${origY + dy}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    })

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false
        handle.style.cursor = 'grab'
      }
    })
  }

  // =========================================================================
  // 模块注册
  // =========================================================================

  window.__NAPI_MODULES.push({
    id: MODULE_ID,
    name: 'API Client',
    description: '通用 API 请求工具，自动注入 Cookie & Token',
    icon: API_ICON,

    match() {
      // 在所有页面激活
      return true
    },

    init() {
      if (!document.getElementById(FAB_ID)) {
        createFAB()
      }
      if (!document.getElementById(PANEL_ID)) {
        createPanel()
      }
    },

    destroy() {
      const fab = document.getElementById(FAB_ID)
      const panel = document.getElementById(PANEL_ID)
      if (fab) fab.remove()
      if (panel) panel.remove()
      panelVisible = false
    },
  })
})()
