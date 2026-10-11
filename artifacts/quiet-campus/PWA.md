# iSense 安装版（PWA）

这是原有 React + Vite 应用的渐进增强，不是重写、原生安装包，也没有上架 App Store / Google Play。

## 图标与配置

- 使用团队本次上传的正式 logo；原图保留在 `assets/isense-icon-source.jpg`，没有重绘。
- `public/icons/`：Android 192/512 图标、留有裁切空间的 maskable 512 图标、iOS Apple Touch 180 图标、32px favicon。
- `pwa.config.ts`：应用名称/短名称均为 **iSense**，standalone 显示，允许横竖屏；浅橘主题色、浅蓝启动背景。操作系统决定最终启动画面，未提供适用于所有 iPhone 型号的专用启动图。
- `vite-plugin-pwa` 生成 `manifest.webmanifest`、`sw.js`，路径随原有 artifact 的 `BASE_PATH`，不创建第二套路由。

## iPhone 安装

1. 在 **Safari** 中打开正式发布的 HTTPS 网址，不是在 Replit 编辑器 iframe 中。
2. 点 **分享**（部分版本从浏览器菜单进入），选择 **添加到主屏幕 / Add to Home Screen**。
3. 如果出现 **Open as Web App**，开启它；保留名称 **iSense**，点 **添加 / Add**。
4. 从主屏幕上的正式 logo 图标打开。受支持的浏览器会使用独立窗口。

## Android 安装

1. 在 **Chrome** 打开正式发布的 HTTPS 网址。
2. 当浏览器提供安装事件时，页面会显示可用的 **Install iSense** 按钮。
3. 或点 **⋮ → 添加到主屏幕 → 安装**；有些版本直接显示 **安装应用 / Install app**。
4. 确认后从应用图标打开。

未收到浏览器安装事件时，页面只显示帮助，不显示没有作用的安装按钮。已安装、嵌入式预览和不支持安装的浏览器不会显示该按钮。

## 手机体验

- 保留原有浅橘、浅蓝设计和所有路线/偏好控制。
- 底部只有 **Map、Preferences、Routes** 三个独立页面，不再滚动跳转到长页面中的锚点。默认打开 Map，各页面保留状态并有自己的滚动区域。
- Install 标签已移除。支持的浏览器使用小型安装邀请；关闭偏好保存在本机，之后仍可从 Map → Help → 安装说明查看指导。standalone 窗口不显示安装邀请或安装说明入口。
- 导航单独占用布局空间，预留 Replit 外部反馈按钮的位置，并支持 safe-area；不隐藏或修改外部控件。反馈提供方的弹出说明面板仍由提供方自己控制。
- 支持 safe-area、横竖屏、44px 触摸目标、较大滑块手柄和可缩放文字。
- 动画和滚动保持克制；尊重 `prefers-reduced-motion`。
- “Very Quiet”“Quiet”等选项下仍显示范围；原有权重、锁定、Reset、接受阈值、额外步行分钟限制、排名算法均未替换。

## 离线与隐私边界

- **首次联网访问且静态缓存完成后**，可离线打开 app，操作偏好并比较自带的 DEMO 路线。
- **不提供离线真实路线生成**。实时 Google 地图更新、Routes 请求和导航交接需要网络。
- 缓存只有本应用静态入口、JS/CSS、图标和 manifest；不配置 runtime API 缓存。
- 不缓存 `/api/*`、路线响应、Google Maps 脚本/瓦片或服务端密钥；导航回退只匹配本应用入口，不覆盖其他 artifact 或 API。
- 重要性百分比、接受度、额外步行分钟数及锁定状态保存在本机 localStorage，重载或重开 app 后恢复；不会发送到服务器。损坏或旧格式的设置会恢复安全默认值。存储不可用时界面会明确提示仅在本次会话保留。
- 地点、设备定位、导入观测及路线仍只在当前标签页内存中，关闭或重载会清除。公开界面没有团队访问码字段。
- 新版缓存准备好后由用户选择更新；更新说明会提醒重载丢失当前内存中的工作，不自动重载。
- 如果曾在离线状态启动而没有取得服务器配置，恢复网络后可能需要重载才能使用实时地图；不会自动请求付费路线。
- 系统限制、私人浏览模式、存储清理和缓存淘汰都可能影响离线能力；不能保证永久离线可用。

## 构建与验证

从项目根目录运行：

```sh
pnpm --filter @workspace/quiet-campus run typecheck
scripts/node_modules/.bin/tsx --test artifacts/quiet-campus/src/lib/*.test.ts
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
```

`PORT`/`BASE_PATH` 来自现有 artifact；上例是当前工作区值，不能用它替代其他环境注入的设置。

重生成图标（只用于维护，运行已构建 app 不需要 Python）：

```sh
python artifacts/quiet-campus/scripts/generate-app-icons.py
```

此工具的 Pillow 依赖由工作区的 Python 配置记录。

**开发预览不注册 Service Worker。** 用生产构建测试安装和离线，避免缓存 Vite/HMR 的开发版本。

## 发布与 Google 手动设置

本次查询确认现有生产网址为 **https://isense-uiuc.replit.app**。本轮代码修改仍需重新发布才会出现在该网址；开发预览不等于生产版。线上当前配置的地图和 Routes 开关均关闭，本轮未更改开关。

1. 在 Replit 编辑器右上角点 **Publish**。
2. 检查现有发布设置；若要让团队成员在自己的手机直接打开，选择适当的公开访问设置。确认后点 **Publish**。
3. 成功后复制 Publishing 工具提供的真实 HTTPS URL。不要猜测网址或把开发域名当成生产域名。
4. Google Cloud Console → **APIs & Services → Credentials** → 现有 **浏览器地图密钥** → **Application restrictions: Websites / HTTP referrers**。
5. 为实际发布域名添加 `https://实际域名/*`，保留需要的开发域名；不要改成允许所有网站。
6. 浏览器密钥仅限制到 **Maps JavaScript API**。服务器的 Routes 密钥继续留在 Replit Secrets / 服务器环境，不复制进前端、manifest 或源码。
7. 核对服务器允许来源设置是否包括该生产 origin。路线调用批准、公开模式的单独授权、持久化预算限制仍须满足；本次没有启用付费开关，也没有重置预算。配置步骤见 `PUBLIC_ROUTING.md`。
8. 在手机实际安装并测试 Main Quad → Grainger 导航行为。真实 Google Routes 付费测试须另行批准。

无法从本工作区直接核验 Google Cloud 的密钥限制；**不能宣称生产域名已获允许**。没有修改或打印任何密钥。

## 首次 PWA 改造的历史验证（四入口版本）

| 检查 | 本次结果 |
| --- | --- |
| 生产构建与 TypeScript 检查 | 通过 |
| 离线逻辑测试 | 52 项通过（地点输入及预设更新后） |
| Manifest / Service Worker / 图标 | 通过；15 个静态缓存条目，未发现外部 API 资源或凭据模式 |
| 生产构建的浏览器离线重载 | 通过；worker 控制页面，缓存完成后可重载 DEMO app |
| 离线 API 边界 | `/api/healthz` 请求失败，不会错误返回缓存的 app HTML |
| 偏好与路线 | 滑块、100% 总和、锁定、Reset、接受阈值、0 分钟额外步行限制和 9/9/10 分钟筛选通过 |
| Google 导航链接 | A/B/C 各自 waypoints 参数检查通过；用记录器替代打开，不访问 Google |
| 手机宽度与导航 | 390×844、844×390 无水平溢出；四个入口均可滚动到对应内容 |
| 底栏遮挡 | 首次测试发现问题；已改成独立布局行，定向复查通过 |
| 安装提示 | 无安装事件时不显示按钮；模拟事件验证调用及取消处理；iOS/Android UA 说明分支通过 |
| 原生安装事件 | 测试浏览器未提供，未验证真实系统安装弹窗 |
| HTTPS | 开发 HTTPS 预览返回 200、证书验证成功；本地生产测试使用 localhost 的安全上下文例外 |
| API 服务 | 清理已确认的旧实例后，原有托管服务启动正常；没有修改服务器代码或预算数据库 |
| 发布 / 生产地图密钥限制 | 未发布；尚无生产 URL，无法核验该域名的 Google 允许列表 |

浏览器测试期间拦截了 Google API / 地图请求，**没有执行新的 Google Routes 付费请求**。字体资源受拦截产生的资源提示、密码输入不在表单内的 DOM 提示，不是未捕获的 app 运行异常。

真实 iPhone/Android 主屏幕安装、OS 启动画面、正式 HTTPS 生产域名和真实 Google 导航仍需要团队在发布后验证，不能用浏览器模拟冒充真机测试。

地点搜索更新的历史版本曾通过生产构建、静态缓存及横竖屏检查，缓存后的 DEMO 离线重载正常。那一轮采用底部 Install；本轮已移除该入口，安装说明统一在 Help。上述历史记录不代表本轮三页面版的真机验证。详见 [地点输入说明](LOCATION-SEARCH.md)。

## 本轮三页面版本验证

- 74 项离线路由、预算、观测、偏好及导航链接测试通过；另 2 项错误展示格式测试通过。
- iSense 和 API Server 类型检查、生产构建通过。全仓类型检查曾报告无关 mockup-sandbox 的 Vite 插件类型版本冲突；本轮没有改动该 artifact。
- 390×844 浏览器验证了默认 Map、初始空路线页、100% 分配、锁定不移动、接受度与数字分钟输入、跨页面/重载保留偏好。
- 0 分钟下 A/B 的最快时间并列保持有效；C 在独立的超时说明中可查看，但不参与推荐或导航。调高分钟上限会重新纳入时间范围。
- 浏览器记录器检查路线链接，不打开 Google；B 的手动导航同步了当前选择。back/forward 切换页面，横竖屏三个导航按钮中心均可点击，无水平溢出。
- 矮横屏中内容需要在自己的区域滚动；底栏占独立布局行，不将屏幕外尚未滚入视野的控件算作可见。安装邀请也改为独立布局行，不盖住 Find routes。
- 邀请关闭偏好、合成原生安装事件、iPhone 手动步骤、Escape、standalone 隐藏和旧 Install fragment 迁移已用浏览器模拟检查。Help 快捷按钮的发现性修正及最后布局调整用源码与编译检查确认，未再完整跑浏览器流程。
- 拦截的模拟接口验证了仅一次显式 POST、仅一条路线时不造出其他路线、8 min 45 sec / 634 m 原值、无团队码或 Authorization、偏好/页面变更不触发请求、429 不自动重试。错误适配支持已有接口的嵌套和扁平格式，并有独立测试。

验证时 Google 服务被拦截。**没有测试真实 Google Routes、真机主屏幕安装或真机 Google 导航**。新版也尚未重新发布；生产授权、额度和密钥限制仍需所有者按 [公开路由检查](PUBLIC_ROUTING.md) 核对。
