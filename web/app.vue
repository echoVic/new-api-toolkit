<template>
  <div class="app">
    <header class="nav">
      <NuxtLink to="/" class="brand">New API 倍率计算器</NuxtLink>
      <nav>
        <NuxtLink to="/model-ratio">模型倍率</NuxtLink>
        <NuxtLink to="/recharge-ratio">充值倍率</NuxtLink>
      </nav>
    </header>
    <main class="main">
      <NuxtPage />
    </main>
    <footer class="footer">
      <p>开源站长工具 · <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener">New API</a></p>
    </footer>
  </div>
</template>

<style>
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #24292f; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; border-bottom: 1px solid #e5e7eb; }
.brand { font-weight: 700; text-decoration: none; color: #111827; }
.nav nav a { margin-left: 16px; text-decoration: none; color: #374151; }
.main { padding: 24px; }
.footer { padding: 24px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
</style>
