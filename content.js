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
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  // =========================================================================
  // 初始化
  // =========================================================================

  function init() {
    console.log(`[NAPI Toolkit] Initializing (${window.__NAPI_MODULES.length} modules registered)`)
    activateModules()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000))
  } else {
    setTimeout(init, 1000)
  }
})()
