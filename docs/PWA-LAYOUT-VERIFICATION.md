# iSense：PWA 底部空白与地图分区修复

日期：2026-10-11

## 结论与验证边界

已修改当前应用，没有创建第二个项目，没有部署、推送或合并到 main。
类型检查、153 项 Node 回归测试、生产构建、PWA 静态校验通过。
浏览器验证发现的地图画布 0px 高度问题已修复，并由同一个浏览器会话定向复核通过。

**没有实际已安装的 iPhone PWA 可供测试。** 下文的 Safari 是 Chromium 中的 Safari
UA 模拟，standalone、键盘、非零安全区及后台恢复均有模拟部分。
这些结果不能证明用户的实体 iPhone 问题已经彻底解决。
没有为浏览器测试请求真实 Google Maps、Places 或 Routes；SDK、地点结果和 API 均为模拟。

## 原因：已确认的代码问题与仍未确认的手机原因

1. 旧外壳不论是否正在编辑输入，都用 `visualViewport.height` 和 `offsetTop`
   设置整屏高度及顶部位置。它把可能暂时偏矮的可视视口当成应用布局视口，
   且原来的键盘判定依赖曾出现过的最大 `innerHeight`。
2. 原地图和规划卡片都绝对定位在同一个工作区中；卡片位于地图之上。
   两个区域确实重叠，不是单纯缺少底部 padding。
3. 第一轮验证还发现，地图内部依赖嵌套百分比高度，隐藏搜索/标签后再显示
   或改成短屏时，地图区域有高度，但内部画布会缩成 0px。
4. 静态读取当前公开站点的 CSS，仍有旧可视视口变量和绝对定位卡片，
   没有本轮新的键盘专用高度变量及地图分区规则；线上尚未使用本轮构建。

可以复现旧外壳策略制造底部空白：852px 的 CSS 视口中，
模拟旧 `top=20px / height=768px`，导航底部为 788px，产生 **64px 空白**。
去掉这两个覆盖，即便 VisualViewport 仍偏矮，导航底部也恢复为 852px。

**仍不能确认**实体 iPhone 上的具体差值来自哪个 WebKit/系统状态。
没有把“Safari 工具栏预留”当成已证实原因；已安装 PWA 不应先被假定为 Safari 标签页。

## 修复结构

- 外壳：默认 `100dvh`，不支持时回退 `100vh`，采用 header / main / navigation
  单一纵向布局。没有添加工具栏占位、任意底部偏移或第二份 home-indicator 间隔。
- VisualViewport：仅在可编辑元素聚焦、无缩放且有明显键盘遮挡时提供临时高度；
  失去编辑焦点即移除。监听可视视口变化、焦点、页面恢复、可见性和方向变化，
  不保存历史最大屏幕高度。
- 地图：地图分区与规划卡片是正常纵向文档流中的兄弟区域，间距 8px。
  地图获得剩余空间；地图内部使用明确伸展的 grid/flex 尺寸，不再依赖嵌套百分比链。
  画布有明确高度，并在尺寸变化、搜索返回及标签返回时通知现有地图实例重排。
- 规划卡片：短屏时在卡片内部滚动，保留 44px GPS / swap 触控目标和原 Find routes。
  不把地图拖到输入区域后面。
- 导航：仍是 Map / Preferences / Routes / Reports，四个等宽单行按钮；
  底部安全区只放在导航背景内部，按钮位于 home indicator 上方。
- 全屏搜索：地图、规划卡片和导航隐藏，但原地图实例保留；
  建议列表单独滚动，取消或选定地点后恢复主屏。
- 安装邀请：占自己的布局行，不再浮在规划卡片之上；安装、关闭及记忆功能保留。

Maps/Places/Routes 的密钥、开关、费用预留、限流、每日额度、服务端校验没有修改。
推荐算法、偏好持久化、锁定、时间/天气、社区上报及离线日照模型没有修改。
PWA manifest、缓存策略和锁文件没有修改。

## 实测数值

以下单位均为 CSS px；小数四舍五入。0px 指**导航背景下方**的空白，
不是要求按钮文字压到屏幕最底边。

| 环境 | 导航 top / bottom | 地图区域高 / 画布高 | 规划卡片 top / bottom | 导航下方空白 |
|---|---:|---:|---:|---:|
| Chromium 手机尺寸模拟 393×852，修复后 | 794 / 852 | 423.20 / 421.20 | 543.20 / 782 | 0 |
| standalone 模拟 393×852，top=59、bottom=34 安全区 | 761 / 852 | 331.20 / 329.20 | 510.20 / 749 | 0 |
| 横屏 852×393，修复后 | 344 / 393 | 96.86 / 94.86 | 209.86 / 338 | 0 |
| 小屏 320×568，修复后 | 510 / 568 | 165.70 / 163.70 | 285.70 / 498 | 0 |

- 各尺寸地图/规划卡片无相交，无横向溢出。画布在地图区边框内，不覆盖输入框。
- 普通 393×852 时，`innerHeight / clientHeight / body.scrollHeight / CSS视口高`
  均为 852；普通 `visualViewport.height=852, offsetTop=0`。
- standalone 模拟时上述高度仍为 852，导航内底部 padding 为 **38px =
  34px 模拟安全区 + 4px 常规间距**。导航背景延伸到底，不重复扣除安全区。
- 键盘模拟：`innerHeight=852`，`visualViewport.height=542, offsetTop=12`；
  搜索区域 bottom=554，模拟 Main Library 建议 bottom=306.5，处于键盘上方。
  地图、规划卡片及导航的可见矩形均为空。
- 在 VisualViewport 仍为 542/12 时选定结果，编辑焦点消失，外壳立即恢复 852；
  不需等待旧可视视口数值恢复。
- 修复后，同一页面从搜索返回、四标签返回、横屏、小屏、再回竖屏：
  地图构造次数保持 **1**，resize 通知 **1→2→3→4→5→6**。
- Safari-UA 模拟显示正常安装邀请，占独立 68.5px 行；
  此时 main 与 nav 间距包含这张可见邀请，不是导航下面的空白。

## 行为与未执行项目

通过：

- 起点/终点全屏搜索、取消、选定结果后返回。
- Main Library 经模拟 Places New 建议及模拟 `fetchFields` 获得坐标后才确认；
  一次模拟建议、一次模拟详情，无实际 Google 查询。模拟坐标不写入校园数据。
- 四标签切换及返回、偏好/锁定/5 分钟额外步行限制保存并在刷新后恢复。
- 短屏内部滚动；GPS/swap 44×44，Find routes 至少 44px 高；
  四导航按钮保持单行、等宽。
- 模拟后台隐藏/恢复、pageshow/focus 后高度恢复。
- Help 的测量/下载生成真正的 JSON；不包含地点坐标、密钥或偏好。
- 153 项现有及新增 Node 测试，包含新增键盘/视口判定的 6 项测试。
- 类型检查、构建、manifest/图标/静态缓存检查及 `git diff --check`。

未执行/未验证：

- 实体 iPhone 的 Safari、已安装 PWA、真实软键盘及系统后台恢复。
- 实际 Google 地图画面、Places/Routes 网络请求；本轮均使用模拟与网络阻断。
- 社区数据库写入或提交；上报 API 未改动，浏览器使用空列表模拟，未写数据库。
- 安装、升级服务工作线程的真实手机生命周期。开发预览不注册生产 service worker；
  开发服务器直接访问 manifest 返回 HTML，不能据此验收安装。构建后的 manifest
  linkage、`display: standalone`、图标与静态缓存已由生产构建检查。
- 未复跑未改动的 Python 日照模型；本轮没有改变该离线流程。

## 修改文件

应用代码（9 个）：

1. `artifacts/quiet-campus/src/native-screens.css`：单一视口、地图/规划卡片分离、
   内部画布尺寸、安全区及邀请布局。
2. `artifacts/quiet-campus/src/hooks/use-visual-viewport.ts`：键盘专用覆盖、当前 CSS
   视口测量和恢复事件，不保留过期屏幕最大值。
3. `artifacts/quiet-campus/src/components/map-screen.tsx`：增加地图兄弟分区，
   全屏搜索时隐藏背景主屏，保留地图实例。
4. `artifacts/quiet-campus/src/components/google-campus-map.tsx`：仅增加尺寸观察/
   resize 通知，没有改变加载、Google 授权、路线或标记逻辑。
5. `artifacts/quiet-campus/src/App.tsx`：Help 接入布局测量入口。
6. `artifacts/quiet-campus/src/lib/viewport-layout.ts`：纯键盘视口判定。
7. `artifacts/quiet-campus/src/lib/viewport-layout.test.ts`：6 项离线测试。
8. `artifacts/quiet-campus/src/lib/layout-diagnostics.ts`：只采集几何的诊断。
9. `artifacts/quiet-campus/src/components/layout-diagnostics.tsx`：按需查看/下载测量。

说明与记忆：本文档及 `.agents/memory/isense-pwa.md`。
截图/原始 JSON 在 `generated-artifacts/pwa-layout/`，为已忽略的生成文件，不部署。
保留了第一轮失败证据；以 `fixed-map-resize-*.json/png` 为修复后的画布复核结果。

## 可复跑命令

```sh
pnpm run typecheck
scripts/node_modules/.bin/tsx --test --test-reporter=dot \
  artifacts/api-server/src/lib/*.test.ts \
  artifacts/api-server/src/lib/*.test.mjs \
  artifacts/quiet-campus/src/lib/*.test.ts
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
git diff --check
```

浏览器测试使用预导航的 SDK 模拟、精确 `/api/` 拦截、Google 域名阻断、
可调 VisualViewport 和模拟 standalone。没有自动执行真实 Find routes。
开发演示入口 `/?preview=demo&safeArea=iphone` 可安全检查无 Google 地图的
非零安全区布局，但**不能代替真实地图画布的验证**。

## 发布与 iPhone 真机检查

**需要 Republish，当前没有执行。** 根据 Replit 官方发布说明，重新发布会将
新代码快照替换到现有公开 URL，不需要新域名。

1. 在 Replit 打开 Publishing，选择现有 iSense，点击 Republish。
   不新建部署，不改 Google 密钥/开关/限额；保留 `https://isense-uiuc.replit.app`。
2. 已安装 PWA 如显示更新提醒，点击 **Update & reload**。
   当前行程和导入数据会重置，已保存偏好及锁定保留。不要为刷新而卸载 PWA
   或清空网站存储，否则可能删掉设置。
3. 从 iPhone 主屏幕图标打开，确认不是 Safari 标签页。Help →
   **Layout measurements** → **Download measurements**：
   `layoutVersion` 应为 `pwa-flow-2026-10-11`，`standaloneDetected` 应为 true。
   如果仍没有此入口，先检查是否还是旧发布/缓存，别调整密钥来解决布局问题。
4. 正常 Map：检查 logo 不碰状态栏、地图与输入分开、四导航单行。
   导航背景应到屏幕底，home indicator 在安全区内；不应另外留一块工具栏高度。
5. 打开起点/终点搜索，观察真实键盘时的建议区域，取消返回；
   重复三次，再切换四标签。不要点 Find routes，也不必输入新地点，
   避免为布局检查发起 Places/Routes 请求。
6. 将应用切到后台再返回、横竖屏切换，再下载一次几何 JSON；
   检查当前 CSS 视口高度与 app/nav bottom，而非把 852 当成所有状态的固定值。
7. 若仍有空白，提供 JSON 和完整屏幕截图。真实键盘期间的详细测量如需获取，
   使用 Safari Web Inspector；Help 下载通常用于键盘已关闭、回到 Map 后的状态。

实际手机开启现有真实地图的使用仍遵循项目原有 Google 授权及费用规则；
本文浏览器测试没有重新联网验证它。
