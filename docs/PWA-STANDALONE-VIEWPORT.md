# iSense：真机底部空白的第二次修正

## 已确认的事实

用户提供的完整截图为 1179×2556 像素。与测量文件中 393px 的网页宽度对照，
对应 393×852 的屏幕逻辑尺寸。截图中的导航位置与 JSON 的网页坐标一致。
该 JSON 同时报告：

- standalone 已启用、键盘关闭、缩放比例 1。
- innerHeight、visualViewport.height、CSS 动态视口均为 793px。
- 导航底部也是 793px；与屏幕底部相差 59px。
- 导航的底部 padding 是 38px，其中 34px 为安全区，仅计算一次。

之前的 belowNavigationGap=0 只证明填满了 **793px 网页视口**，
不是到达 852px 的实际屏幕边缘。本次不能继续用这个结果声称真机已修复。

## 应用端修改

1. html/body/root 不再继承可能偏短的 `height:100%`，而使用同一视口高度来源。
2. 普通浏览器继续使用动态视口；不使用手机屏幕高度强行铺满。
3. standalone 同时测量动态、大型、传统及 fixed containing block 视口。
4. 更大的尺寸必须通过最底端 DOM 命中测试，才能用于外壳、地图和导航。
5. 如果 WebView 不提供该区域，则立即恢复可交互尺寸，避免隐藏导航按钮。
6. 键盘关闭时恢复此前已验证的尺寸；横屏、恢复前台时重新测量，不记住旧的手机高度。
7. 帮助测量新增屏幕尺寸、像素比例、浏览器版本、各视口单位值、可交互检测及策略。
8. 不可扩展时，Help 明确提示限制；不再把内部 0px gap 当作物理屏幕验收。

没有硬编码 852px 或额外加 59px；没有修改 API、费用限制、环境变量、
推荐算法、Google 授权、偏好、社区数据库、地图与规划卡片的上下布局。
天气栏保持移除。

## 修改文件

- artifacts/quiet-campus/src/native-screens.css
- artifacts/quiet-campus/src/hooks/use-visual-viewport.ts
- artifacts/quiet-campus/src/lib/viewport-layout.ts
- artifacts/quiet-campus/src/lib/viewport-layout.test.ts
- artifacts/quiet-campus/src/lib/viewport-measurement.ts（新增）
- artifacts/quiet-campus/src/lib/viewport-measurement.test.ts（新增）
- artifacts/quiet-campus/src/lib/layout-diagnostics.ts
- artifacts/quiet-campus/src/components/layout-diagnostics.tsx

另更新项目记忆，保留真机/网页视口区别及重装数据保护规则。

## 验证

- 工作区类型检查通过。
- 完整离线回归：157 项通过，0 失败。
- 浏览器发现最底端半像素取整的误判后进行了修正。
- 修正后的视口专项：12 项通过，包含新增的 2 项 DOM 命中边界回归。
- 最终构建与 PWA 静态检查通过；仍只预缓存静态文件，无 Maps/API 缓存。
- 定向浏览器复核通过，所有 Google 网络请求被拦截、没有真实付费调用或数据写入。

| 合成浏览器场景 | 最终导航底部 | 策略 |
| --- | ---: | --- |
| 动态 793、大视口 852、底部可命中 | 852px | standalone-expanded |
| 动态 793、大视口 852、793 以下无法命中 | 793px | standalone-platform-limited |
| 聚焦键盘 542，然后取消搜索且键盘数据尚未恢复 | 恢复 852px | 清除键盘覆盖 |
| 横屏 852×393 | 393px | 重新测量，无旧高度 |
| 普通浏览器动态 793、大视口 852 | 793px | browser-dynamic |

四个标签的切换与返回通过。第二个场景保留的 59px 是不可交互平台模型，
**不是已经解决真机空白的证据**。修改后的实体 iPhone、iOS 版本、
安装时保存的状态栏设置尚未验证。

## 与平台问题的关系

WebKit 有相同类型的公开问题：

- https://bugs.webkit.org/show_bug.cgi?id=313800
- https://bugs.webkit.org/show_bug.cgi?id=301994
- https://bugs.webkit.org/show_bug.cgi?id=316008

报告涉及 standalone 网页的可用高度短于屏幕、系统区域无法由 DOM 访问，
以及状态栏元数据可能在安装时保存。症状匹配不能代替本机版本和运行时证据。
仅把 CSS 改大，不能保证修复 iOS 不允许访问的区域。

## 下一步

本轮没有部署、推送或合并 main。先 **Republish 当前应用**，再正常关闭并
重新打开已有主屏幕图标；如出现更新提示，按提示更新。更新会重置当前标签页
内未保存的路线、导入预测及草稿，先导出需要保留的内容。

Help → Layout measurements 的新版本标识为：
`pwa-reachable-viewport-2026-10-11`。

- `standalone-expanded`：应用已选择可交互的大视口；仍需完整真机截图确认结果。
- `standalone-platform-limited`：浏览器无法命中更大的区域，不能继续把导航往外挪。
  结合 JSON 的浏览器/视口信息与完整截图判断 iOS 或安装配置限制。
- `standalone-dynamic`：CSS 单位没有提供更大的尺寸；不能据此认定物理屏幕没有空白。

**不要先清缓存、删除 PWA 或重装。** 这些操作可能删除本地偏好，
且不保证解决 OS 问题。先保存偏好与标签页内工作，再讨论需要的系统/安装操作。
