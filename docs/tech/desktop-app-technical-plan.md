# Loomic 桌面端改造技术方案

> 版本：v1.0 · 日期：2026-10-23

## 1. 结论与范围

当前项目已经具备比较适合桌面化的边界：`apps/web` 是 Next.js 15 静态导出前端，`apps/server` 是 Fastify API + WebSocket + LangGraph Agent，图片/视频生成由 Worker 通过 Supabase PGMQ 异步处理，账号、项目、画布、资源、积分和支付都在 Supabase/云端服务中完成。

一期建议做成**连接型桌面应用**：

```text
Electron 主进程
  ├─ 管理窗口、协议、系统菜单、文件对话框、更新
  ├─ 启动并注入桌面运行时配置
  └─ 通过受限 IPC 暴露桌面能力

Renderer（复用 apps/web 的静态导出）
  ├─ React/Excalidraw 画布
  ├─ 对话、图片/视频生成、Brand Kit、Skills
  └─ REST + WSS 访问云端 API

云端（保持现状）
  ├─ Fastify + LangGraph API
  ├─ Image/Video Worker + PGMQ
  └─ Supabase Auth / PostgreSQL / Storage
```

一期不把 `SUPABASE_SERVICE_ROLE_KEY`、数据库连接串、AI Provider Key 或 Lemon Squeezy 服务端密钥打进客户端。桌面端仍然使用现有云端 API，用户只需登录即可使用当前功能。

离线模式、内置 PostgreSQL/PGMQ、打包 ComfyUI 模型和完全本地生成不纳入一期。现有服务端依赖 Supabase PGMQ 和大量模型文件，直接改成离线应用会变成数据层、认证层和模型分发的另一项工程。

## 2. 技术选型

### 推荐 Electron

选择 Electron 的原因是：

- 当前代码全是 TypeScript/Node.js，Electron 主进程可以直接承接桌面生命周期和 Node 侧能力。
- Next.js 已配置 `output: "export"`，可以直接把 `apps/web/out` 作为 Renderer 资源。
- 现有 Fastify、WebSocket、文件处理和构建脚本不需要改写成 Rust。
- macOS、Windows、Linux 的打包、签名和自动更新生态成熟。

Tauri 的安装包通常更小，但当前服务端若要在本机运行，需要额外打包 Node sidecar 或重写为 Rust；这不适合当前第一阶段的交付目标。待连接型桌面端稳定后，再评估 Tauri 或独立的本地运行时。

### 进程与安全边界

Renderer 只运行 Web UI；主进程负责原生能力。窗口必须使用 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`，Preload 通过 `contextBridge` 暴露细粒度方法，不暴露原始 `ipcRenderer`。只允许加载内置 `app://loomic` 页面，外部页面和新窗口统一走 HTTPS 白名单。

应用使用自定义协议承载静态资源，不使用 `file://`。Electron 官方安全指南也建议启用上下文隔离和沙箱、限制导航和新窗口，并优先使用自定义协议。

## 3. 建议的代码结构

新增 `apps/desktop`：

```text
apps/desktop/
  src/main.ts                 # app 生命周期、窗口、协议、单实例
  src/preload.ts              # contextBridge 白名单 API
  src/runtime-config.ts       # API 地址、Supabase 公共配置、版本
  src/auth-deep-link.ts       # loomic://auth/callback
  src/native-files.ts         # 打开/保存/下载文件
  src/window-policy.ts        # 导航、权限、外部链接策略
  src/auto-updater.ts         # 更新检查、下载、安装
  electron-builder.yml        # 安装包和签名配置
  package.json
  tsconfig.json
```

现有代码的适配点：

| 文件/模块 | 改造内容 |
|---|---|
| `apps/web/src/lib/env.ts` | 增加运行时配置读取；桌面端优先读取 `window.__LOOMIC_DESKTOP__`，Web 端继续读取 `NEXT_PUBLIC_*`。 |
| `apps/web/src/lib/desktop.ts` | 增加 `isDesktop`、`openExternal`、`showSaveDialog`、`onAuthCallback` 等能力检测和类型声明。 |
| `apps/web/src/lib/supabase-browser.ts` | 保持公开 URL/anon key；增加桌面端 OAuth 的 redirect URI 和可选安全存储适配器。 |
| `apps/web/src/app/auth/callback/page.tsx` | 支持普通 Web 回调和 `loomic://auth/callback?code=...` 回调，统一调用 `exchangeCodeForSession`。 |
| `apps/web/src/lib/auth-context.tsx` | 处理桌面 deep link、恢复会话和应用重启后的登录态。 |
| `apps/web/src/hooks/use-create-project.ts` | 桌面端用单窗口路由切换；不要依赖浏览器标签页和 `window.open`。 |
| `apps/web/src/components/canvas-files-panel.tsx`、下载组件 | 桌面端接管保存对话框；Web 端保留浏览器下载。 |
| `apps/server/src/app.ts` | CORS 增加 `app://loomic`（或签名配置中的桌面 Origin）白名单。 |
| `apps/server/src/config/env.ts` | 增加 `LOOMIC_ALLOWED_ORIGINS`/桌面 Origin 配置，保留 Web 的 `LOOMIC_WEB_ORIGIN`。 |
| `apps/web/next.config.ts` | 保留静态导出；确保资源路径、Excalidraw 字体和路由在 `app://loomic` 下可用。 |
| 根 `package.json`、`turbo.json` | 增加 desktop 的 dev/build/package/typecheck 任务。 |

## 4. 运行时设计

### 4.1 启动流程

1. Electron 获取单实例锁；已有实例时把命令行中的 deep link 转交给已有窗口。
2. 注册 `app://loomic` 协议，将 `apps/web/out` 映射为只读静态资源。
3. 创建 BrowserWindow，加载 `app://loomic/index.html`。
4. Preload 暴露版本、平台、API 地址和桌面能力；Renderer 完成 Supabase 会话初始化。
5. 应用退出时清理监听器、待处理下载和更新任务。

`serverBaseUrl` 不再只依赖构建时注入的 `NEXT_PUBLIC_SERVER_BASE_URL`，而是由主进程注入运行时配置。这样同一安装包可以切换生产、预发布或自部署 API，而不必重新构建前端。

### 4.2 API 和 WebSocket

- 生产环境使用 `https://api.<domain>` 和 `wss://api.<domain>`；开发环境继续支持 `http://localhost:3001`。
- 现有 WebSocket URL 生成逻辑可以复用，但要覆盖休眠唤醒、网络切换和窗口恢复后的重连测试。
- Fastify CORS 必须允许 `app://loomic`，并且只允许明确的桌面 Origin；不能使用通配符。
- Renderer 不直接连接 Supabase 数据库，不接触 PGMQ；所有业务请求继续经过 Fastify。
- WebSocket 查询串中的 token 在发布前应避免写入访问日志；可先确保生产日志脱敏，后续改为握手头或首条认证消息。

### 4.3 认证和 OAuth

邮箱/密码登录沿用现有 Supabase Auth。Google OAuth 采用系统浏览器 + 自定义 URI：

1. Renderer 请求 Supabase OAuth URL，并通过受限 IPC 交给主进程调用 `shell.openExternal`。
2. Supabase 的允许回调地址增加 `loomic://auth/callback`。
3. 系统浏览器完成登录后唤起 `loomic://auth/callback?code=...`。
4. 主进程把 code 发送给 Renderer，复用现有 `exchangeCodeForSession`。
5. 登录成功后执行现有 viewer bootstrap，进入 `/home`。

主进程要覆盖 macOS 的 `open-url`、Windows/Linux 的第二实例参数，并处理应用未启动时的 deep link。支付、帮助文档和其他外链同样通过 HTTPS 白名单交给系统浏览器。

### 4.4 文件和导出

一期先保留浏览器文件输入兼容性，再增加桌面增强能力：

- 图片/视频导入：`dialog.showOpenDialog`，限制扩展名和文件大小。
- 画布/图片/视频导出：`dialog.showSaveDialog` + 主进程异步写文件。
- 下载事件：拦截默认下载，显示原生进度和取消操作。
- 导出失败时保留当前画布状态，并在 UI 展示可重试错误。

不要向 Renderer 暴露任意路径读写 API；每次文件操作都由主进程校验来源、扩展名和目标路径。

## 5. 构建、打包和发布

### 构建链路

```text
pnpm --filter @loomic/shared build
pnpm --filter @loomic/web build       # 生成 apps/web/out
pnpm --filter @loomic/desktop build   # 编译 main/preload
pnpm --filter @loomic/desktop package # electron-builder 生成安装包
```

桌面包只包含静态前端、主进程、Preload、图标和运行时公共配置。生产 API、Worker、Supabase 和 AI Provider 继续部署在现有 Railway/Vercel/Supabase 体系中。

### 发布目标

- macOS：Apple Silicon 和 Intel，Developer ID 签名、notarization、DMG。
- Windows：x64 为首发，Authenticode 签名、NSIS 安装包。
- Linux：AppImage 为首发，后续视用户量增加 deb/rpm。

CI 使用平台矩阵构建；签名证书和更新发布凭据只放在 CI Secret。自动更新首选 GitHub Releases 或现有对象存储，更新通道至少区分 `stable` 和 `beta`。

## 6. 分阶段实施

### Phase 0：技术验证

- 新建 `apps/desktop` 最小壳。
- 能加载 `apps/web/out`，完成邮箱登录、一次 REST 请求和一次 WebSocket 对话流。
- 验证自定义协议、CORS、Supabase OAuth 回调和 macOS/Windows 单实例。

验收：桌面包可登录并打开已有项目，不修改服务端数据模型。

### Phase 1：桌面 MVP

- 完成运行时配置、路由适配、OAuth deep link。
- 完成画布、对话、图片/视频生成、项目切换和 WebSocket 重连。
- 完成文件导入、导出、外链、窗口关闭和错误页。
- 加入开发脚本和本地打包脚本。

验收：核心 Web 功能在安装包内达到浏览器版本同等结果。

### Phase 2：发布质量

- 完成安全策略、权限处理、下载进度、崩溃日志和诊断页。
- 完成自动更新、签名、notarization、CI 多平台构建。
- 用真实生成任务做长时间运行、网络切换、睡眠唤醒和进程异常恢复测试。

验收：可向内部用户发布签名 beta，升级和回滚路径可验证。

### Phase 3：增强能力（可选）

- 系统托盘、任务完成通知、快捷键、最近项目和文件关联。
- 加密保存可选的个人 API 配置。
- 评估本地 ComfyUI/本地 Agent 模式；单独设计数据存储和模型分发，不与云端 MVP 混在一个安装包里。

## 7. 安全、质量和验收标准

发布阻断项：

- Renderer 不启用 Node integration；context isolation 和 sandbox 开启。
- Preload 不暴露原始 IPC；每个 IPC handler 校验 sender 和参数。
- 禁止任意导航、任意新窗口和任意外链；外链必须 HTTPS 白名单。
- 生产只使用 HTTPS/WSS；API 日志不记录 bearer token。
- 安装包内没有服务端密钥、数据库连接串或 Provider secret。
- CORS 仅允许生产 Web Origin 和桌面 Origin。

功能验收至少覆盖：登录/退出/重启恢复、Google OAuth、项目创建与删除、画布保存恢复、图片和视频生成、生成失败与重连、Brand Kit/Skills、资源导入、画布与媒体导出、支付页面外链、自动更新。

性能指标先建立基线再定阈值，至少记录冷启动、首屏、Renderer 内存、WebSocket 重连时延和大图/视频导出耗时；不能用桌面壳掩盖现有 Web 或 API 的性能问题。

## 8. 主要风险与应对

| 风险 | 应对 |
|---|---|
| 静态导出在自定义协议下路由或资源失败 | 先做 Phase 0 smoke test；统一协议路径解析，禁止在业务中拼接本地绝对路径。 |
| OAuth 自定义 URI 在不同系统行为不一致 | 为每个平台做真实安装包回调测试，并保留邮箱/密码登录作为降级路径。 |
| `window.open`、浏览器下载与多标签逻辑不适合桌面 | 桌面端统一单窗口路由，下载和外链由主进程接管。 |
| 网络断开或电脑休眠导致生成流中断 | 复用现有事件缓冲/轮询机制，补充前台恢复后的状态同步和重连测试。 |
| Electron 包体和内存较大 | 一期优先复用现有代码；上线后再根据基线评估 Tauri 或更细的资源拆分。 |
| 用户要求“完全离线” | 明确作为第二产品形态；不能把现有 Supabase/PGMQ 云端架构伪装成离线能力。 |

## 9. 建议的第一批实施顺序

先做 `apps/desktop` 壳、运行时配置、`app://loomic` 资源加载和 API/WSS 连通性；随后做 OAuth deep link 与单窗口路由，再接文件导入/导出，最后接打包签名和自动更新。只有这条主链路稳定后，才加入托盘、通知和本地模型等桌面增强能力。
