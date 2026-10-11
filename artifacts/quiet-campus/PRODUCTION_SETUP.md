# iSense：生产配置与单次实测

此指南来自现有代码，不另建路由系统，不更换密钥，不提高或重置已有保护。
四页面 UI 和共享 Community Reports 已实现；源码修改不会自动更新公开网站。

## 预算检查的准确代码

`artifacts/api-server/src/lib/routing-budget.ts` 的 `configuredBudgetLimits()`
读取以下六项。每项经 `Number(value)` 转换后，必须满足
`Number.isSafeInteger(number) && number > 0`。

| 环境变量 | 未设置时的默认值 | 单位与作用 |
| --- | ---: | --- |
| `ROUTING_MAX_PER_MINUTE` | 3 | 全应用每个固定 UTC 分钟的预留请求次数 |
| `ROUTING_MAX_PER_DAY` | 10 | 全应用每个 UTC 日的预留请求次数，00:00 UTC 重置 |
| `ROUTING_MAX_TOTAL` | 20 | 账本累计预留次数，不自动重置 |
| `ROUTING_MAX_CONCURRENT` | 1 | 全应用正在执行的请求数量 |
| `ROUTING_BUDGET_CENTS` | 100 | 全应用累计**估算预留预算**，单位为美分，不是 Google 账单上限 |
| `ROUTING_REQUEST_RESERVE_CENTS` | 无有效默认值，必须明确设置 | 每次尝试的保守估算预留，单位为美分 |

推荐只输入十进制数字字符串，如 `3`，不加引号、单位、注释、美元符号或逗号。
数值范围是 1–9007199254740991；演示应保持上述低限额，不能把这个技术范围当成推荐额度。
当前解析器也接受可转换为正整数的 `10.0`、`1e2` 等格式，但不推荐。
变量**不存在**时可使用上述默认值；显式设置为空白、0、负数、非整数或非数值则无效。
任意无效字段都会触发 `BUDGET_NOT_CONFIGURED`，发生在调用 Google 之前。

小型 hackathon 可以保留这些现有默认限额作为上限；如果已有更低限额，保留更低值。
100 cents 是代码现有的内部预算默认值，不是对 Google 收费的报价或保证。
下面给出官方价格依据。所有者已批准仅保存每次 2 美分预留，
已核对生产环境变量保存成功；这不代表已发布或已执行真实 Routes 请求。
不能因为存在免费额度就填 0。预算剩余至少应容纳一次该预留。

## 当前请求对应 SKU 与官方价格

核查日期：2026-10-10（UIUC 本地日期）。

现有 `lib/campus-routing/server/google-routes.js` 调用 `directions/v2:computeRoutes`：
`travelMode=WALK`、`computeAlternativeRoutes=true`、高质量编码 polyline；
输出字段仅为时长、距离、编码 polyline、route labels。
没有 intermediate waypoints、waypoint optimization、traffic-aware routing、
location modifiers、two-wheel、tolls、traffic-on-polyline 或 large-vehicle 参数。
按 Google 官方 SKU 触发规则，当前请求属于 **Routes: Compute Routes Essentials**，
不是 Route Matrix，也不是 Pro/Enterprise。替代路线仍在同一次 Compute Routes 查询内，
不是按返回的路线条数分别算本应用的请求次数。

官方标准全球价格表：

| SKU | 每月免费事件上限 | 免费上限后的首档，每 1,000 次 | 折合每次 |
| --- | ---: | ---: | ---: |
| Routes: Compute Routes Essentials | 10,000 | US$5.00 | US$0.005 = 0.5 美分 |

此为公开标准全球价，不是已经核实的本项目账单。免费额度是否剩余、印度计价、
合同折扣、币种换算和税费必须由所有者在实际计费项目中确认。
估算保护不依赖免费额度；标准 Google 单价也不是本应用自动获取的运行时输入。

**已批准并保存到生产环境：`ROUTING_REQUEST_RESERVE_CENTS=2`。**
这是每次 2 美分的保守内部预留，相当于当前标准 Essentials 首档价格的四倍，
不是在声称 Google 每次收取 2 美分。现有代码只允许整数美分，不能填 `0.5`。
未来请求参数、SKU 或价格变化后必须重新审核此估算，不能认为这个值永远足够。

官方依据：
- [SKU 触发规则](https://developers.google.com/maps/billing-and-pricing/sku-details#compute-routes-ess-sku)
- [标准全球 Routes 价格](https://developers.google.com/maps/billing-and-pricing/pricing#routes-pricing)
- [Routes 用量与计费](https://developers.google.com/maps/documentation/routes/usage-and-billing)

## 可复制的生产配置模板（2 美分预留已批准并保存）

这些都是现有代码使用的名称。前五个数字取自代码默认值；
`ROUTING_REQUEST_RESERVE_CENTS=2` 是所有者批准的配置，不是代码默认值。
实际已有更低额度时保留更低额度，不自动提高。不要把此模板保存为含密钥的 `.env` 文件。
在 Replit 的每个 Name/Value 输入框中只填写对应名称和纯值，不粘贴注释。

```text
ROUTING_MAX_PER_MINUTE=3
ROUTING_MAX_PER_DAY=10
ROUTING_MAX_TOTAL=20
ROUTING_MAX_CONCURRENT=1
ROUTING_BUDGET_CENTS=100
ROUTING_REQUEST_RESERVE_CENTS=2
GOOGLE_MAPS_API_ENABLED=true
GOOGLE_PLACES_API_ENABLED=true
GOOGLE_ROUTES_API_ENABLED=true
GOOGLE_ROUTES_PUBLIC_ENABLED=true
ALLOWED_ORIGINS=https://isense-uiuc.replit.app
```

`ALLOWED_ORIGINS` 若已含其他可信来源，应追加生产 origin，而不是覆盖原列表。
保留现有 `GOOGLE_ROUTES_API_KEY`、`VITE_GOOGLE_MAPS_API_KEY`、`SESSION_SECRET`；
`DATABASE_URL` 是托管变量，不手动修改。模板不包含任何密钥值或替代占位密钥。

在主账本初始为空、按此模板且无其他既有预留时：
- 最多 3 次/固定 UTC 分钟，最多 10 次/UTC 日，并发 1。
- 累计最多 20 次，之后不会因跨日或重启恢复。
- 每次预留 2 美分，20 次共预留 40 美分；累计次数限制会先于 100 美分预算触发。
- 一般情况下，剩余可尝试次数受累计剩余次数及
  `floor((预算 - 已预留金额) / 单次预留)` 两者中较小值限制，再叠加日、分钟和并发限制。
  不要删除账本来恢复额度。

**配置有效且公开开关为 true 后，其他访客也可消耗这些限额。**
当前批准仅保存每次预留值，没有修改其他限额或密钥，也没有发布。
其他设置及公开使用仍需所有者核对；本轮不执行付费 Routes 请求。

## 如何执行及持久化

1. 服务器先检查开关、密钥、来源、JSON、UIUC 坐标和匿名客户端限速。
2. 在 PostgreSQL 事务中锁定 `routing_budget` 的共享账本行，使用数据库时钟
   检查全局分钟、日、累计次数、预算以及并发。
3. 在调用 Google **之前**提交次数和美分预留。
4. 结束后只释放并发占用。失败、拒绝、超时或取消都不自动退还预留。

所有实例共享同一账本。重启、重新发布、UTC 跨日不会重置累计次数或金额；
UTC 跨日只更新日窗口。数据库不可用时返回 `BUDGET_UNAVAILABLE`，没有内存预算回退。
按浏览器和传输对端的额外 3 次/分钟限流在内存中，重启会清除这些快捷计数，
但不能绕过持久化全局限额。代理可能把多名访客视作同一对端，因此限制可能更严格。

这些是**预留请求次数和估算支出**限制，不读取或硬性封顶 Google 的实际账单。
Maps、Places、项目内其他应用的消费不计入此 Routes 账本。
Google Cloud 的服务配额是另一层保护；账单提醒本身不是硬性消费上限。

## Places 的准确条件

`artifacts/api-server/src/lib/google-routes.mjs`：

```js
process.env.GOOGLE_PLACES_API_ENABLED === 'true' && Boolean(browserApiKey)
```

`browserApiKey` 使用现有 `VITE_GOOGLE_MAPS_API_KEY`
（兼容旧名 `GOOGLE_MAPS_BROWSER_API_KEY`）。只有小写、无空格的 `true` 才开启。
开关不是 API 密钥，可以存为生产非敏感环境变量，也可以通过
Publishing 的 Production app secrets 传入；最后都是后端的 `process.env`。

浏览器密钥保持 Websites/HTTP referrer 限制，允许实际生产域名，
API 限制按需包含 Maps JavaScript API 和 Places API (New)。
不要使用 unrestricted key，不要把 Routes 服务器密钥放到浏览器，不需要换密钥。
前一次单次生产 Places 查询已成功，说明该查询当时有权限；
不等于核实所有 Places 操作的配额或完成自动补全选择的全流程。

## 在 Replit 中操作

1. 打开本项目的 **Publishing → Adjust settings → Production app secrets**。
   不要只修改 Development Secrets。已有部署可能保留自己的设置；
   工具中保存的新生产变量不等于旧部署已经使用新值。
2. 找到 `GOOGLE_PLACES_API_ENABLED`，确认值为 `true`，
   并检查部署中没有保留旧的 `false` 覆盖。
3. 确认 `ROUTING_REQUEST_RESERVE_CENTS=2`。该值已按所有者批准保存为生产环境变量，
   但旧部署仍需重新发布才会采用新设置。
   检查其余五项：可保留有效现值或上表默认值；不要留空行。
4. 核对现有开关，不修改任何密钥：
   `GOOGLE_MAPS_API_ENABLED=true`，
   `GOOGLE_ROUTES_API_ENABLED=true`，
   `GOOGLE_ROUTES_PUBLIC_ENABLED=true`。
   公开 Routes 开启且预算有效后，普通访客也可以消耗这些限额，不仅测试人员。
5. 保留 `SESSION_SECRET` 和现有两个 Google 密钥。
   允许来源列表需包含真实生产 origin。若自动来源列表未包含它，
   在 `ALLOWED_ORIGINS` 中加入 `https://isense-uiuc.replit.app`；
   多个 origin 用逗号分隔，保留现有可信来源，不添加通配符。
6. **Republish** 当前项目，保留现有域名。发布时审核新增 Reports 表的
   开发→生产结构变更，不选择覆盖、重建或重置生产数据。不要删除路由账本。
7. 只检查 `/api/maps/config` 中的安全状态字段：
   `placesEnabled=true`、`budgetConfigured=true`、
   `clientLimitsConfigured=true`、`publicRoutesEnabled=true`。
   如不通过，新版 `budgetConfigurationIssues` 会列出不合格变量名。
   不把包含浏览器密钥的完整配置响应复制到聊天或日志。
8. 已安装 PWA 按现有更新提示接受更新并重新打开；刷新不能替代服务器重新发布。

紧急停止 Routes：把生产 `GOOGLE_ROUTES_API_ENABLED` 改为 `false` 并重新发布。
它由服务器检查，隐藏前端按钮不是停止保护。

## 本轮配置核查

- 保存预留值前的在线复查返回 `BUDGET_NOT_CONFIGURED` 和 `PLACES_DISABLED`，
  且 Reports 接口返回 404，说明新实现尚未发布。
- 已保存的生产变量包括 `GOOGLE_PLACES_API_ENABLED=true` 和
  `ROUTING_REQUEST_RESERVE_CENTS=2`；每次预留值已通过环境配置回读确认。
- 已发布旧版本没有 `budgetConfigurationIssues`。其实际快照中的每项预算值
  不能从旧接口逐项核实；重新发布后应确认具体字段诊断，不猜测隐藏覆盖值。
- 生产路由账本只读查询未发现主账本记录。未预留或执行本轮真实 Routes 请求。

## 获准的单次测试

配置、数据库和剩余额度检查通过后：

- 一次 Places 搜索；不连续输入多次，不自动重试。
  自动补全后的 Place Details 是另一个操作，不能当作免费的同一次调用。
- 一次 Main Quad → Grainger 步行请求，使用已确认校园坐标，
  核对 Google 返回的时长、距离、几何及导航 URL。
- 修改 Preferences 只重新评分，不追加 Routes 请求。
- 查询后核对持久化次数和预留金额变化，失败也计一次预留。

最新要求是不发送新的付费 Routes 请求，因此本轮只准备此测试，不执行。
先前地图/Places 成功结果不代表
新部署全流程已经通过，也不代表真机导航已经测试。
