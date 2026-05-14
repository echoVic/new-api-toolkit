# 贡献指南

感谢你对 New API Toolkit 的关注！欢迎通过以下方式参与贡献。

## 提交需求 / 反馈

如果你是用户，最快的方式是通过 [飞书表单](https://my.feishu.cn/share/base/form/shrcnRaY2RaMUC5EPv1z9YmcW0c) 提交需求或反馈。

也可以直接在 GitHub 上 [创建 Issue](https://github.com/echoVic/new-api-toolkit/issues/new/choose)。

## 开发贡献

### 环境准备

1. Fork 并 clone 仓库
2. 打开 `chrome://extensions/`，开启开发者模式
3. 点击「加载已解压的扩展程序」，选择项目根目录
4. 修改代码后，在扩展页面点击刷新图标即可热加载

### 添加新模块

在 `modules/` 下新建 JS 文件，注册到模块系统：

```js
window.__NAPI_MODULES.push({
  id: 'your-module',
  name: '模块名称',
  match(path) {
    // 返回 true 时模块激活
    return path.includes('/your-path/')
  },
  init() {
    // 模块初始化逻辑
  },
  destroy() {
    // 模块卸载逻辑（SPA 路由切换时调用）
  },
})
```

然后在 `manifest.json` 的 `content_scripts[0].js` 数组中追加文件路径。

### 提交 PR

1. 基于 `master` 创建功能分支：`git checkout -b feat/your-feature`
2. 提交有意义的 commit message
3. 确保扩展能正常加载运行
4. 创建 Pull Request，描述改动内容

### 代码规范

- 不使用构建工具，保持零依赖、零构建
- 模块之间通过 `window.__NAPI_FETCH` / `window.__NAPI_UI` 通信
- CSS 样式内联在模块中，避免全局污染

## 协议

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 协议，贡献代码即表示同意以相同协议发布。
