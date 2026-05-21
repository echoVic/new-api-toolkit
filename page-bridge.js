/**
 * 页面主世界脚本 —— 负责执行 fetch 请求
 * 运行在页面上下文中，可以完整访问页面的 cookie/session 和 localStorage
 * 通过 window.postMessage 与 content script 通信
 *
 * 支持完整请求选项：method, headers, body
 */
;(function () {
  'use strict'

  // =========================================================================
  // 主动监听 localStorage 变化，登录完成时立即推送凭据
  // =========================================================================

  /**
   * 拦截 localStorage.setItem，当 token 或 user 被写入时主动推送凭据
   * 这解决了：用户跳转到站点登录后，凭据不能及时同步回扩展的问题
   */
  // 需要监听的凭据相关 key（New API + Sub2API）
  const CRED_KEYS = ['token', 'user', 'auth_token', 'auth_user', 'access_token']

  const originalSetItem = Storage.prototype.setItem
  Storage.prototype.setItem = function (key, value) {
    originalSetItem.call(this, key, value)
    if (this === localStorage && CRED_KEYS.includes(key)) {
      // 延迟一点以确保 token 和 user 都已写入
      setTimeout(pushCredsToExtension, 300)
    }
  }

  /**
   * 监听 storage 事件（来自其他标签页的 localStorage 变化）
   */
  window.addEventListener('storage', (event) => {
    if (event.storageArea === localStorage && CRED_KEYS.includes(event.key)) {
      setTimeout(pushCredsToExtension, 300)
    }
  })

  /** 主动将当前凭据推送给 content script */
  function pushCredsToExtension() {
    const token = getAccessToken()
    const userId = getUserId()
    const { role, platform } = getUserRoleAndPlatform()

    // 只在有有效凭据时推送
    if (token || userId) {
      window.postMessage({
        type: 'NAPI_CREDS_PUSH',
        origin: window.location.origin,
        token: token || '',
        userId: userId || '',
        role,
        platform,
      }, '*')
    }
  }

  /** 从 localStorage 解析用户角色和平台类型 */
  function getUserRoleAndPlatform() {
    // New API: localStorage.user
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        if (user?.id) return { role: user.role ?? 0, platform: 'new-api' }
      }
    } catch {}
    // Sub2API: localStorage.auth_user
    try {
      const authUserStr = localStorage.getItem('auth_user')
      if (authUserStr) {
        const user = JSON.parse(authUserStr)
        if (user?.id) return { role: user.role === 'admin' ? 10 : 1, platform: 'sub2api' }
      }
    } catch {}
    return { role: 0, platform: '' }
  }

  // =========================================================================

  /** 从 localStorage 中获取 user ID（兼容 New API 和 Sub2API） */
  function getUserId() {
    try {
      // New API: localStorage.user = JSON { id, role, ... }
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        if (user?.id) return String(user.id)
      }
    } catch {}
    try {
      // Sub2API: localStorage.auth_user = JSON { id, username, ... }
      const authUserStr = localStorage.getItem('auth_user')
      if (authUserStr) {
        const user = JSON.parse(authUserStr)
        if (user?.id) return String(user.id)
      }
    } catch {}
    return ''
  }

  /** 从 localStorage 中获取 access token（兼容多种存储 key） */
  function getAccessToken() {
    try {
      // 尝试常见的 token 存储 key
      return localStorage.getItem('token')
        || localStorage.getItem('auth_token')
        || localStorage.getItem('access_token')
        || localStorage.getItem('session_token')
        || ''
    } catch {}
    return ''
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return

    // 凭据采集请求
    if (event.data?.type === 'NAPI_CREDS_REQUEST') {
      const userId = getUserId()
      const token = getAccessToken()
      const { role, platform } = getUserRoleAndPlatform()
      window.postMessage({
        type: 'NAPI_CREDS_RESPONSE',
        callbackId: event.data.callbackId,
        origin: window.location.origin,
        token: token || '',
        userId: userId || '',
        role,
        platform,
      }, '*')
      return
    }

    if (event.data?.type !== 'NAPI_FETCH_REQUEST') return

    const { callbackId, url, options } = event.data

    try {
      const userId = getUserId()
      const accessToken = getAccessToken()

      const method = options?.method || 'GET'
      const extraHeaders = options?.headers || {}

      const headers = {
        'Accept': 'application/json',
        'Cache-Control': 'no-store',
        ...extraHeaders,
      }

      // 自动注入 New-API-User
      if (userId && !headers['New-API-User']) {
        headers['New-API-User'] = userId
      }

      // 自动注入 Authorization（Bearer token）
      if (accessToken && !headers['Authorization']) {
        headers['Authorization'] = accessToken
      }

      // POST/PUT/PATCH 默认 Content-Type
      if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }

      const fetchOptions = {
        method: method.toUpperCase(),
        credentials: 'include',
        headers,
      }

      if (options?.body !== undefined && options.body !== null && method.toUpperCase() !== 'GET') {
        fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      }

      const resp = await fetch(url, fetchOptions)

      const status = resp.status
      const statusText = resp.statusText

      // 收集响应头
      const responseHeaders = {}
      resp.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      let body
      const contentType = resp.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        body = await resp.json()
      } else {
        body = await resp.text()
      }

      window.postMessage({
        type: 'NAPI_FETCH_RESPONSE',
        callbackId,
        result: body,
        meta: { status, statusText, headers: responseHeaders },
      }, '*')
    } catch (e) {
      window.postMessage({
        type: 'NAPI_FETCH_RESPONSE',
        callbackId,
        error: e.message,
      }, '*')
    }
  })
})()
