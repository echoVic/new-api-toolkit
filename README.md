# New API Log Exporter - Chrome Extension

一个 Chrome 浏览器插件，为 New API 系统的使用日志页面添加「导出 Excel」功能。

## 功能

- 在使用日志页面自动注入「导出 Excel」按钮
- 复用当前页面的登录状态，无需额外配置
- 自动读取页面上的筛选条件（时间范围、模型、用户名等）
- 分页拉取全量数据（每页 100 条），支持进度显示
- 使用 SheetJS 生成标准 .xlsx 格式文件
- 支持三种日志类型：Common Logs / Drawing Logs / Task Logs

## 安装方法

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension/` 文件夹
5. 插件安装完成

## 使用方法

1. 打开你的 New API 系统的使用日志页面（`/usage-logs/common` 等）
2. 在页面上设置需要的筛选条件（时间范围、模型名、用户名等）
3. 在工具栏中找到「导出 Excel」按钮并点击
4. 等待数据拉取完成，.xlsx 文件会自动下载

## 导出字段

### Common Logs
ID、时间、类型、用户名、用户 ID、令牌名、模型、额度、额度($)、输入 Tokens、输出 Tokens、请求耗时、流式、分组、渠道 ID、渠道名、Request ID、Upstream Request ID、IP、内容、模型倍率、补全倍率、分组倍率、缓存 Tokens

### Drawing Logs
ID、MJ ID、用户 ID、渠道 ID、动作、状态、进度、提示词、提示词(EN)、失败原因、提交时间、完成时间、图片 URL

### Task Logs
ID、Task ID、用户 ID、用户名、渠道 ID、平台、动作、状态、进度、失败原因、提交时间、完成时间

## 技术实现

- **Manifest V3** Chrome Extension
- **Content Script** 注入 UI 按钮并执行导出逻辑
- **SheetJS (xlsx)** 生成 Excel 文件
- 复用页面的 Cookie/Session 进行 API 认证
- MutationObserver 监听 SPA 路由变化，自动重新注入按钮

## 注意事项

- 导出大量数据时可能需要一些时间（每页 100 条，逐页拉取）
- 导出的数据受限于当前筛选条件
- 需要确保在使用日志页面已登录
- 最多拉取 20000 条数据（200 页 × 100 条/页）
