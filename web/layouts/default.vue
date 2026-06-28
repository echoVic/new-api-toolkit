<template>
  <div class="shell">
    <nav class="nav">
      <NuxtLink to="/" class="brand">New API 工具箱</NuxtLink>
      <div class="links">
        <NuxtLink to="/model-ratio" class="nav-item" active-class="nav-active">模型倍率</NuxtLink>
        <NuxtLink to="/recharge-ratio" class="nav-item" active-class="nav-active">充值倍率</NuxtLink>
        <NuxtLink to="/benchmark" class="nav-item" active-class="nav-active">API 压测</NuxtLink>
      </div>
    </nav>
    <main>
      <slot />
    </main>
    <footer class="footer">
      <p>开源站长工具 · <a href="https://github.com/QuantumNous/new-api" target="_blank" rel="noopener">New API</a></p>
    </footer>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafbfc;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { font-weight: 700; color: #111827; text-decoration: none; }
.links { display: flex; gap: 4px; }
.nav-item {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 14px;
  color: #555;
  text-decoration: none;
  transition: background 0.15s;
}
.nav-item:hover { background: #e5e7eb; }
.nav-active { background: #dbeafe; color: #1d4ed8; font-weight: 500; }
main { flex: 1; width: 100%; max-width: 820px; margin: 0 auto; padding: 24px 16px; }
.footer { border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; padding: 20px 16px; text-align: center; }
.footer a { color: #6b7280; }
</style>
