# New API Toolkit

一个模块化的 Chrome 浏览器插件，为 [New API](https://github.com/Calcium-Ion/new-api) 管理面板提供实用增强工具。

## 功能模块

### 📊 日志导出 (Log Export)

在使用日志页面注入「导出 Excel」按钮，一键导出日志数据。

- 复用当前页面的登录状态，无需额外配置
- 自动读取页面上的筛选条件（时间范围、模型、用户名等）
- 分页拉取全量数据（每页 100 条），支持进度显示
- 使用 SheetJS 生成标准 .xlsx 格式文件
- 支持 default 前端 (`/usage-logs/*`) 和 classic 前端 (`/console/log`)
- 支持三种日志类型：Common Logs / Drawing Logs / Task Logs

### ⚡ API Client

在任意 New API 页面提供浮动 API 请求面板。

- 自动注入 Cookie & Token，无需手动配置认证
- 支持 GET / POST / PUT / PATCH / DELETE 方法
- JSON Body 编辑，响应实时查看
- 显示响应状态码、耗时、数据大小
- 面板可拖拽，支持显示/隐藏切换

## 安装方法

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目根目录
5. 插件安装完成

## 使用方法

### 日志导出

1. 打开你的 New API 系统的使用日志页面（`/usage-logs/common` 等）
2. 在页面上设置需要的筛选条件（时间范围、模型名、用户名等）
3. 点击页面上注入的「导出 Excel」按钮
4. 等待数据拉取完成，.xlsx 文件会自动下载

### API Client

1. 打开任意 New API 页面
2. 点击页面右下角的闪电图标按钮
3. 在弹出的面板中输入 API 路径（如 `/api/user/self`）
4. 选择 HTTP 方法，点击 Send 发送请求

## 导出字段

### Common Logs
ID、时间、类型、用户名、用户 ID、令牌名、模型、额度、额度($)、输入 Tokens、输出 Tokens、请求耗时、流式、分组、渠道 ID、渠道名、Request ID、Upstream Request ID、IP、内容、模型倍率、补全倍率、分组倍率、缓存 Tokens

### Drawing Logs
ID、MJ ID、用户 ID、渠道 ID、动作、状态、进度、提示词、提示词(EN)、失败原因、提交时间、完成时间、图片 URL

### Task Logs
ID、Task ID、用户 ID、用户名、渠道 ID、平台、动作、状态、进度、失败原因、提交时间、完成时间

## 技术架构

- **Manifest V3** Chrome Extension
- **模块化设计** — `content.js` 为模块加载器，功能模块在 `modules/` 下独立实现
- **模块生命周期** — 每个模块通过 `match()` 声明匹配页面，支持 `init()` / `destroy()` 自动管理
- **SPA 路由监听** — MutationObserver 监听路由变化，自动激活/卸载模块
- **Fetch 桥接** — `page-bridge.js` 在 MAIN world 运行，代理 API 请求以复用页面认证
- **SheetJS (xlsx)** — 生成 Excel 文件

## 项目结构

```
├── manifest.json          # 扩展配置
├── content.js             # 模块加载器 & 通用工具
├── page-bridge.js         # Fetch 桥接（MAIN world）
├── content.css            # 全局样式
├── popup.html / popup.js  # 扩展弹出面板（模块状态查看）
├── modules/
│   ├── log-export.js      # 日志导出模块
│   └── api-client.js      # API Client 模块
├── lib/
│   └── xlsx.full.min.js   # SheetJS 库
└── icons/                 # 扩展图标
```

## 注意事项

- 导出大量数据时可能需要一些时间（每页 100 条，逐页拉取）
- 导出的数据受限于当前筛选条件
- 需要确保在使用日志页面已登录
- 最多拉取 20000 条数据（200 页 × 100 条/页）

## 贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[CC BY-NC-SA 4.0](LICENSE)
