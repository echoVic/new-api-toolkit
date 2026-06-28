<script setup lang="ts">
useSeoMeta({
  title: 'API 压测工具 — 中转站 API 并发性能测试',
  description: '在线并发压测 New API / One API 中转站，支持 OpenAI 与 Anthropic 格式，测量延迟、TTFT、TPS、RPM/TPM 等指标。',
})
</script>

<template>
  <div>
    <h1>API 压测工具</h1>
    <p>对中转站 API 发起并发请求，测量延迟百分位、吞吐量、TTFT/TPS 等性能指标。支持 OpenAI 兼容和 Anthropic 格式。</p>
    <aside class="note">
      <strong>使用须知</strong>
      <ul>
        <li>请求由<strong>你的浏览器</strong>直接发往目标 API，API Key 不经过任何服务器。</li>
        <li>仅支持<strong>开启 CORS</strong> 的中转站（new-api / one-api 默认开启）；前置反向代理剥离 CORS 头的站点会失败。</li>
        <li>受浏览器并发连接数限制，适合快速摸底；高并发容量测试请用 k6 / EvalScope 等专用工具。</li>
        <li>流式模式的 TPS 按返回分片估算，仅供参考；非流式的 token 数取自接口 usage 字段。</li>
      </ul>
    </aside>
    <BenchmarkCalc />
  </div>
</template>

<style scoped>
.note {
  margin: 16px 0;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
}
.note strong { color: #334155; }
.note ul { margin: 8px 0 0; padding-left: 18px; }
.note li { margin: 4px 0; line-height: 1.6; }
</style>
