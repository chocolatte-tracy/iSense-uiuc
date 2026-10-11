# iSense：公开路由与发布检查

## 本轮定位到的问题

2026-10-10 检查已有生产部署 `https://isense-uiuc.replit.app`：
`GET /api/maps/config` 正常返回，但 `enabled`、`routesEnabled` 都是 false。
因此旧版公开界面的实时路线按钮不可用。现有服务器还要求团队授权；
仅删除输入框或把 Google 密钥放到浏览器都不能安全解决问题。

本轮已删除公开界面的团队码输入，保留原来的
`POST /api/walking-routes`、队友路由模块和持久化预算。**没有启用任何付费开关**。
Main Quad → Grainger 的 9/9/10 分钟研究 demo 可通过 Find routes 使用；
其他地点不会获得虚构路线。

## 安全的公开模式

- 默认 `GOOGLE_ROUTES_PUBLIC_ENABLED` 未设或不是 `true`：保留原团队授权，公开前端不发起实时路线请求。
- `GOOGLE_ROUTES_API_ENABLED=true` 是 Google 路由批准开关，与公开模式、地图显示批准各自独立。
- 公开模式不需要用户登录或填写访问码，但并不代表没有限制：请求来源须在现有允许列表，浏览器 `Sec-Fetch-Site` 须为 `same-origin`；输入只能为不同的、有限数值的 UIUC 区域坐标，不接受任意地址或额外请求字段。
- 地点范围与现有 picker 相同：纬度 40.08–40.135，经度 −88.255–−88.205。它是服务范围限制，不是观测数据的覆盖声明。
- 每个传输对端最多 3 次/分钟；不信任客户端提供的 `X-Forwarded-For`。若代理把所有访客合并为一个对端，限速会更保守。此计数有界且仅在内存中，**不能替代**下面的持久化预算。
- 匿名访客另有服务器签名、15 分钟有效的 Secure/HttpOnly/SameSite=Strict Cookie
  和每客户端 3 次/分钟限制。需要至少 32 字符的服务器 `SESSION_SECRET`。
  这不是登录或身份认证；清 Cookie 不会绕过传输对端和持久化全局限额。
- 原 PostgreSQL 原子预留继续限制全局分钟/日/总次数、并发及估算成本。默认 3 次/分钟、10 次/UTC 日、总计 20 次、并发 1、估算预算 100 cents；总次数与预留金额不随重启/重新发布清零。不创建新数据库或预算表。
- 必须由所有者设置正整数 `ROUTING_REQUEST_RESERVE_CENTS`，代表保守的每次尝试成本预留。这不是 Google 价格报价，也不保证实际账单等于估算。失败、超时、取消不会自动退款。
- 预算不可用或配置无效时阻止调用；前端显示错误，不自动重试。服务器密钥从不返回给前端。
- 来源/浏览器元数据不是身份认证，非浏览器客户端可以伪造它们。公开 API 仍可能遭预算耗尽或拒绝服务；持久化限额限制成本，但不等同于完整反滥用服务。扩大使用前应评估可信代理、访客会话及更强的反滥用措施。

## 所有者接下来要点击什么

1. 先检查 Google Cloud Console → APIs & Services：需要 **Routes API**。地图显示另需 **Maps JavaScript API**；已准备的地址搜索使用 **Places API (New)**，并由 `GOOGLE_PLACES_API_ENABLED` 单独控制。本轮不自动开启任何 API 或计费。
2. Credentials 中，服务器密钥只允许 Routes API；浏览器密钥按使用需求只允许 Maps JavaScript API 和 Places API (New)，网站允许列表加入真实发布域名 `https://isense-uiuc.replit.app/*` 和需要的预览来源。不要把服务器密钥放入浏览器或 Git。服务器 IP 限制只能在确认稳定出口 IP 后设置，不能猜测。地图/Places 用量不受 Routes 预算保护，需另设 Google Cloud 配额。
3. 在 Replit **Publishing → Adjust settings → Production app secrets** 核对生产环境中的现有服务器密钥 `GOOGLE_ROUTES_API_KEY`，以及允许的来源。开发与生产配置要分别检查；不需要向聊天发送密钥。
4. 在 Google Cloud 的 Routes API Quotas & System Limits 设置适合这次试用的低配额，并设置账单提醒。提醒不是硬性消费上限，不能取代应用预算。
5. 所有者审核并设定 `ROUTING_REQUEST_RESERVE_CENTS`、`ROUTING_BUDGET_CENTS`、`ROUTING_MAX_TOTAL`、`ROUTING_MAX_PER_DAY`、`ROUTING_MAX_PER_MINUTE`、`ROUTING_MAX_CONCURRENT`。提高或重置既有总预算需要单独评估；不能为了让按钮可用而删除账本。
6. **只有明确批准真实调用和公开使用后**，才把生产 `GOOGLE_ROUTES_API_ENABLED` 和 `GOOGLE_ROUTES_PUBLIC_ENABLED` 设置为 `true`，并重新发布以应用设置。开启公开模式会让一般访客也能消耗限额；本轮未执行此步骤。
7. 重新发布后核对 `/api/maps/config`：`publicRoutesEnabled=true` 才表示前端可尝试实时路线。不要将响应中的浏览器密钥复制进日志或聊天。数据库预算仍会在每次实际调用前检查。
8. 获得单次测试许可后，Main Quad → Grainger 点一次 Find routes，核对返回条数、秒数、米数及 Google 几何；不要假设必定有三条替代路线。团队另行在真机检查 Google Maps 是否接受 waypoints，本轮不声称测试过真机导航。

## 验证命令

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/quiet-campus run typecheck
scripts/node_modules/.bin/tsx --test artifacts/api-server/src/lib/*.test.ts artifacts/api-server/src/lib/*.test.mjs artifacts/quiet-campus/src/lib/*.test.ts
pnpm --filter @workspace/api-server run build
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
```

离线测试用合成凭据和模拟 Google 响应；不运行队友模块的 `test:live`。
生产网址来自部署服务查询，不由开发域名推测。
本轮源码需要重新发布，不声称现有线上旧版已更新或真实路由已通过测试。

## 离线安全复核与生产设置

服务开关的准确条件是
`process.env.GOOGLE_ROUTES_API_ENABLED === 'true'`。
生产环境未设置该变量，因此第一道检查直接返回 `503 ROUTES_DISABLED`，
尚未访问 Google。已配置的服务器密钥不能替代明确启用开关。
已发布代码还未包含当前配置诊断字段，需要重新发布现有应用。

生产密钥设置中确认 `GOOGLE_ROUTES_API_KEY` 和 `SESSION_SECRET`，不要在聊天
或 Git 中填写它们。建议先配置以下项目，保持两个 Routes 开关为 `false`：

```text
ALLOWED_ORIGINS=https://isense-uiuc.replit.app
ROUTING_MAX_PER_MINUTE=3
ROUTING_MAX_PER_DAY=10
ROUTING_MAX_TOTAL=20
ROUTING_MAX_CONCURRENT=1
ROUTING_BUDGET_CENTS=100
ROUTING_REQUEST_RESERVE_CENTS=<所有者审核的正整数，每次尝试预留美分>
GOOGLE_ROUTES_API_ENABLED=false
GOOGLE_ROUTES_PUBLIC_ENABLED=false
```

100 cents 是内部保守估算预算，并非对实际 Google 账单的保证。
例如所有者选择每次预留 10 cents，则此预算最多允许 10 次尝试，
即使总次数上限为 20；任一限额先到即停止。10 cents 不是 Google 价格报价，
应结合实际 Routes SKU、计费项目和 Cloud 配额由所有者确认。

在 **Publishing → Adjust settings → Production app secrets** 配置生产项，
然后 **Republish** 现有部署，保留原域名。先检查 `/api/maps/config` 中：
`integrationVersion=places-new-v1`、`routingKeyPresent=true`、
`budgetConfigured=true`、`clientLimitsConfigured=true`。
只核对这些安全状态，不把完整含浏览器密钥的配置响应贴入聊天。

所有者确定允许公开付费使用后，再设：

```text
GOOGLE_ROUTES_API_ENABLED=true
GOOGLE_ROUTES_PUBLIC_ENABLED=true
```

再次 Republish。`publicRoutesEnabled=true` / `routingStatus=READY_UNVERIFIED`
仅代表应用配置可尝试调用，不证明 Google 密钥、API 授权、费用或配额已通过。
Cloud 权限无法在当前连接下直接检查。紧急停止请将
`GOOGLE_ROUTES_API_ENABLED=false` 并重新发布；已发出的请求不能撤回，预留不退款。

**持久性区别：** PostgreSQL 中的全局分钟/日/累计请求、预留成本跨进程和
重启保留；客户端/传输对端的一分钟计数仅在进程内，重启重建。
数据库不可用时拒绝调用。并发预留通过锁串行处理，短期租约到期后释放并发，
不重置总次数和金额。所有校验均在服务器执行，不能用请求参数提高限额。
来源头可伪造，这仍不是完整的自动化攻击防护或每人的身份识别系统。

离线复核覆盖：无访问码公开成功、关闭开关、缺失密钥、缺失客户端签名配置、
无效预算、每日额度耗尽、客户端及对端限速、越界/相同/非坐标输入、
额外请求字段、持久化预留、并发、失败不退款。均使用 mock。
应用套件 99 项通过（含 15 项昼夜测试），原队友模块的 27 项也通过。
原模块使用上传原型的完整测试封装/静态 fixtures，在临时目录指向当前核心；
未把原型服务器或 UI 加入应用，也未运行 live-test。

**单次受控测试计划（尚未获准执行）：**
Main Quad `(40.1075212,-88.227231)` →
Grainger `(40.1124997,-88.2269172)`，仅发起一次现有
`POST /api/walking-routes`；不运行 Maps/Places、不重试。审核现有账本后，
首测可临时限制 `ROUTING_MAX_PER_DAY=1`、`ROUTING_MAX_TOTAL=1`，并为一次尝试
配置已审核的预算。核对响应时间、距离、几何、错误分类和一次预留；
不承诺三条路线或真机 waypoint 行为。执行前必须取得单独批准。
