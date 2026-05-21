/**
 * New API Toolkit - Content Script (Module Loader)
 *
 * 模块化架构：
 * - 此文件为模块加载器，负责检测当前页面并激活匹配的功能模块
 * - 每个模块在 modules/ 目录下独立实现，通过 NAPI_MODULES 注册
 * - 模块通过 match() 声明自己匹配哪些页面路由
 * - 支持 SPA 路由变化时自动重新评估模块激活状态
 */
;(function () {
  'use strict'

  // =========================================================================
  // 模块注册表
  // =========================================================================

  /**
   * 每个模块的结构：
   * {
   *   id: string,               // 唯一标识
   *   name: string,             // 显示名称
   *   description: string,      // 描述
   *   match: (ctx) => boolean,  // 页面匹配函数，ctx = { path, params, frontend }
   *   init: (ctx) => void,      // 模块初始化（注入 UI 等）
   *   destroy: () => void,      // 模块卸载（清理 DOM 等）
   * }
   */
  window.__NAPI_MODULES = window.__NAPI_MODULES || []

  // =========================================================================
  // 前端检测
  // =========================================================================

  function detectFrontend() {
    const path = window.location.pathname
    if (path.includes('/usage-logs/')) return 'default'
    if (path.includes('/console/')) return 'classic'
    return 'unknown'
  }

  function buildContext() {
    return {
      path: window.location.pathname,
      search: window.location.search,
      params: new URLSearchParams(window.location.search),
      frontend: detectFrontend(),
      origin: window.location.origin,
    }
  }

  // =========================================================================
  // 通用 Fetch 桥接（供所有模块使用）
  // =========================================================================

  /**
   * 通用 Fetch 桥接
   * @param {string} url - 请求 URL（相对或绝对路径）
   * @param {object} [options] - 请求选项
   * @param {string} [options.method='GET'] - HTTP 方法
   * @param {object} [options.headers] - 额外请求头
   * @param {*} [options.body] - 请求体（POST/PUT/PATCH）
   * @param {number} [options.timeout=15000] - 超时毫秒数
   * @param {boolean} [options.raw=false] - true 时返回 { result, meta }
   * @returns {Promise<*>} - 默认返回 response body；raw=true 时返回 { result, meta }
   */
  window.__NAPI_FETCH = function napiToolkitFetch(url, options) {
    return new Promise((resolve, reject) => {
      const callbackId = 'napi_fetch_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      const timeout = options?.timeout ?? 15000
      const raw = options?.raw ?? false

      const handler = (event) => {
        if (event.data?.type === 'NAPI_FETCH_RESPONSE' && event.data?.callbackId === callbackId) {
          window.removeEventListener('message', handler)
          if (event.data.error) {
            reject(new Error(event.data.error))
          } else if (raw) {
            resolve({ result: event.data.result, meta: event.data.meta })
          } else {
            resolve(event.data.result)
          }
        }
      }
      window.addEventListener('message', handler)

      window.postMessage({
        type: 'NAPI_FETCH_REQUEST',
        callbackId,
        url,
        options: options ? {
          method: options.method,
          headers: options.headers,
          body: options.body,
        } : undefined,
      }, '*')

      setTimeout(() => {
        window.removeEventListener('message', handler)
        reject(new Error(`Fetch timeout (${timeout / 1000}s)`))
      }, timeout)
    })
  }

  // =========================================================================
  // 通用 UI 工具（供所有模块使用）
  // =========================================================================

  window.__NAPI_UI = {
    showProgress(text, type) {
      const PROGRESS_ID = 'napi-toolkit-progress'
      let el = document.getElementById(PROGRESS_ID)
      if (!el) {
        el = document.createElement('div')
        el.id = PROGRESS_ID
        el.className = 'napi-export-progress'
        document.body.appendChild(el)
      }
      el.className = 'napi-export-progress' + (type ? ` napi-${type}` : '')
      el.innerHTML =
        type === 'done' || type === 'error'
          ? `<span>${text}</span>`
          : `<div class="napi-spinner"></div><span>${text}</span>`
    },

    hideProgress() {
      const el = document.getElementById('napi-toolkit-progress')
      if (el) el.remove()
    },
  }

  // =========================================================================
  // 自动采集凭据（供 background 渠道监控使用）
  // =========================================================================

  // 监听 page-bridge 主动推送的凭据（登录完成时立即触发）
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'NAPI_CREDS_PUSH') return
    const { origin, token, userId, role, platform } = event.data
    if (origin && (token || userId)) {
      saveCreds(origin, token, userId, role, platform)
    }
  })

  /** 保存凭据到 chrome.storage（monitor_config + balance_sites） */
  function saveCreds(origin, token, userId, role, platform) {
    // 1. 更新 monitor_config（仅限主站点）
    chrome.storage?.local?.get('monitor_config', (data) => {
      const config = data?.monitor_config || {}
      const isMainSite = !config.apiBase || config.apiBase === origin

      if (!isMainSite) return

      let changed = false
      if (!config.apiBase && origin) { config.apiBase = origin; changed = true }
      if (token && config.token !== token) { config.token = token; changed = true }
      if (userId && config.userId !== userId) { config.userId = userId; changed = true }
      if (role !== undefined && config.role !== role) { config.role = role; changed = true }
      if (platform && config.platform !== platform) { config.platform = platform; changed = true }
      // 标记认证方式：有 token 为 token 认证，否则为 cookie 认证
      const authMode = token ? 'token' : 'cookie'
      if (config.authMode !== authMode) { config.authMode = authMode; changed = true }

      if (changed) {
        chrome.storage.local.set({ monitor_config: config })
        console.log('[NAPI Toolkit] Credentials updated for monitor:', origin, 'platform:', platform, 'auth:', authMode)
      }
    })

    // 2. 更新 balance_sites
    chrome.storage?.local?.get('balance_sites', (data) => {
      const sites = data?.balance_sites || []
      const idx = sites.findIndex((s) => {
        // 兼容：存储的 url 可能带路径，用 origin 匹配
        try { return new URL(s.url).origin === origin } catch { return s.url === origin }
      })
      if (idx >= 0) {
        const site = sites[idx]
        let changed = false
        // 修正 url 为 origin（去掉多余路径）
        if (site.url !== origin) { site.url = origin; changed = true }
        if (token && site.token !== token) { site.token = token; changed = true }
        if (userId && site.userId !== userId) { site.userId = userId; changed = true }
        if (role !== undefined && site.role !== role) { site.role = role; changed = true }
        if (platform && site.platform !== platform) { site.platform = platform; changed = true }
        // 标记认证方式
        const authMode = token ? 'token' : 'cookie'
        if (site.authMode !== authMode) { site.authMode = authMode; changed = true }
        if (changed) {
          chrome.storage.local.set({ balance_sites: sites })
          console.log('[NAPI Toolkit] Updated balance site credentials:', origin, 'platform:', platform, 'auth:', authMode)
        }
      }
    })
  }

  function autoCaptureCreds() {
    // 通过 page-bridge 从页面 localStorage 获取凭据
    const callbackId = 'napi_creds_' + Date.now()

    const handler = (event) => {
      if (event.data?.type === 'NAPI_CREDS_RESPONSE' && event.data?.callbackId === callbackId) {
        window.removeEventListener('message', handler)
        const { origin, token, userId, role } = event.data
        if (origin && (token || userId)) {
          saveCreds(origin, token, userId, role)
        }
      }
    }
    window.addEventListener('message', handler)
    window.postMessage({ type: 'NAPI_CREDS_REQUEST', callbackId }, '*')

    // 超时清理
    setTimeout(() => window.removeEventListener('message', handler), 3000)
  }

  // =========================================================================
  // 模块生命周期管理
  // =========================================================================

  const activeModules = new Set()

  function activateModules() {
    const ctx = buildContext()

    for (const mod of window.__NAPI_MODULES) {
      const shouldBeActive = mod.match(ctx)
      const isActive = activeModules.has(mod.id)

      if (shouldBeActive && !isActive) {
        try {
          mod.init(ctx)
          activeModules.add(mod.id)
          console.log(`[NAPI Toolkit] Module activated: ${mod.id}`)
        } catch (err) {
          console.error(`[NAPI Toolkit] Failed to activate module: ${mod.id}`, err)
        }
      } else if (!shouldBeActive && isActive) {
        try {
          mod.destroy?.()
          activeModules.delete(mod.id)
          console.log(`[NAPI Toolkit] Module deactivated: ${mod.id}`)
        } catch (err) {
          console.error(`[NAPI Toolkit] Failed to deactivate module: ${mod.id}`, err)
        }
      }
    }
  }

  // =========================================================================
  // SPA 路由监听
  // =========================================================================

  let lastPath = window.location.pathname + window.location.search

  const observer = new MutationObserver(() => {
    const currentPath = window.location.pathname + window.location.search
    if (currentPath !== lastPath) {
      lastPath = currentPath
      // 延迟以等待 SPA 渲染完成
      setTimeout(activateModules, 1000)
      // 路由变化时重新采集凭据（用户可能刚登录完跳转了）
      setTimeout(autoCaptureCreds, 2000)
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  // =========================================================================
  // 初始化
  // =========================================================================

  function init() {
    console.log(`[NAPI Toolkit] Initializing (${window.__NAPI_MODULES.length} modules registered)`)
    activateModules()
    autoCaptureCreds()
    // 延迟重试一次（登录后 SPA 可能需要几秒才写入 localStorage）
    setTimeout(autoCaptureCreds, 5000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000))
  } else {
    setTimeout(init, 1000)
  }
})()
