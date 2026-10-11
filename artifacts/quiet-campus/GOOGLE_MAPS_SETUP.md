# iSense Google Maps and teammate routing

## 排查公开版 MAPS_DISABLED（地图显示，不是 Routes 或 Places）

后端 `getPublicMapsConfig()` 只有在 `GOOGLE_MAPS_API_ENABLED === 'true'`
且浏览器密钥存在时返回 `enabled: true`。缺少开关仍保持关闭，不自动授权付费使用。
`MAPS_DISABLED` 表示 Google SDK 尚未加载，不能据此判断密钥、API 授权或网站限制有问题。

浏览器密钥由后端读取 `VITE_GOOGLE_MAPS_API_KEY`（或既有兼容名称
`GOOGLE_MAPS_BROWSER_API_KEY`），在地图/Places 允许时通过公共配置送给浏览器。
此应用不依赖 `import.meta.env.VITE_GOOGLE_MAPS_API_KEY` 的构建期替换。
服务端 Routes 密钥从不加入这份浏览器配置。

### 由所有者手动配置

开启地图开关后，访客加载地图也可能产生 Google 费用。现有 Routes 的应用内配额
并不限制 Maps JavaScript API 的地图加载次数；不要把 Routes 预算当作地图费用上限。

1. Replit 打开 **Publishing → Adjust settings → Deployment secrets**。
2. 检查现有 `VITE_GOOGLE_MAPS_API_KEY` 已配置在生产部署；不要把密钥发到聊天或代码里。
3. 只有批准地图加载及可能产生的费用后，添加 `GOOGLE_MAPS_API_ENABLED`，值为小写 `true`。
   保留现有 Routes、Places、预算及配额设置，不需要为显示地图而打开它们。
4. Google Cloud Console 选择该浏览器密钥所属项目。在 **APIs & Services → Library**
   检查 **Maps JavaScript API**；没有启用时，需要所有者自行决定是否启用。
5. **APIs & Services → Credentials → 现有浏览器密钥**：
   **Application restrictions → Websites** 的允许网站应包含
   `https://isense-uiuc.replit.app/*`；**API restrictions → Restrict key**
   应允许 **Maps JavaScript API**。保留既有合法的 Places API (New) 限制和预览网站，
   不把密钥改成无限制，也不要修改 Routes 服务端密钥。
6. 保存并 **Republish** 现有应用，保留原域名。仅修改开发环境不会更新公开部署。
7. 先访问公开版 `/api/maps/config`：预期 `enabled: true`、
   `mapStatus: READY_UNVERIFIED`。不要复制配置中的浏览器密钥到报告。
   这只确认应用开关，不证明 Google 授权或实际地图加载成功。
8. 真正打开地图前需要单独批准一次真实地图加载。用公开 HTTPS 地址，而不是截图工具的
   localhost 地址验证 HTTP referrer。不得为了测试取消网站限制。

本轮只读取了公开站点 HTML 和应用配置，没有请求 Google Maps/Routes/Places。
未直接读取 Google Cloud 权限或计费设置，也未验证真实地图。

### 地点控件与隐私

交换图标交换完整地点对象，包括 place ID、坐标和名称，并使旧路线失效。
Starting at 右侧定位图标使用浏览器定位；拒绝、不可用或超出 UIUC 支持区域时显示提示。
设备坐标保留在当前会话中，不写入 localStorage，不自动请求路线。
在用户明确请求路由并收到 Google 路线结果前，不将设备坐标传给地图组件。
页面切换保留当前地点，重新加载不新增地点持久化。

离线检查：

```sh
scripts/node_modules/.bin/tsx --test artifacts/api-server/src/lib/*.test.ts artifacts/api-server/src/lib/*.test.mjs artifacts/quiet-campus/src/lib/*.test.ts
pnpm --filter @workspace/quiet-campus run typecheck
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
```

## Current status

The team's reusable adapter is mounted on the existing Express backend at
`POST /api/walking-routes`. React uses its decoded paths, waypoint selector, and
Maps URL builder. No second server, second route provider, or `.env` file was added.

Live Routes API requests remain disabled until the user explicitly approves one.
Map-only approval never authorizes a Routes computation.

## Keys and independent switches

Use Replit Secrets, not source code or chat:

| Name | Purpose |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Restricted browser Maps JavaScript API key |
| `GOOGLE_ROUTES_API_KEY` | Private backend Routes API key |
| `GOOGLE_MAPS_API_ENABLED` | Non-secret map-display approval switch |
| `GOOGLE_ROUTES_API_ENABLED` | Non-secret, separate live-routing approval switch |

Both keys are already listed as available in this workspace; their values have
not been printed. Existing legacy aliases remain supported. No Google Cloud
services, billing, keys, or restrictions were changed during integration.

If configuration is needed, open Google Cloud Console → **APIs & Services** →
**Library**, and enable **Maps JavaScript API** and **Routes API** only after
approving the project's billing setup. This integration does not require Places,
Geocoding, or legacy Directions APIs.

For the browser key: **APIs & Services** → **Credentials** → select the browser
key → **Application restrictions: Websites** → add the actual preview origin
followed by `/*` → **API restrictions: Maps JavaScript API** → **Save**.
Do not make the key unrestricted. The local screenshot tool's `127.0.0.1` origin
is not the public Replit preview origin and is not a reason to loosen restrictions.

For the server key: restrict it to **Routes API**. Do not apply HTTP-referrer
restrictions to a server key. Only use IP restrictions after confirming compatible
outbound networking. Never put this key in a `VITE_` variable or browser request.

## Behavior

- Configuration is fetched on startup, but walking routes are fetched only by
  the explicit **Fetch walking routes** action. No automatic retry is performed.
- Request endpoints are captured for route cards and navigation links. Changing
  inputs aborts pending work and hides old routes.
- Google may return zero, one, or several routes. Missing alternatives are not invented.
- Real responses display exact minutes/seconds and meters and draw decoded paths.
- The existing scoring formula, acceptance controls, locks, and extra-minute
  constraint score already-loaded routes locally, without another request.
- Noise, crowd, and sun scores remain **DEMO DATA**, assigned by response order,
  not inferred from geometry or observed on those paths.
- The teammate's waypoint heuristic may interpolate along decoded segments.
  These are not every turn or accessibility-verified positions.
- Google Maps can ignore waypoints or recalculate paths. Phone handoff has not
  been verified by the agent.
- Failures show a safe error category and research demos only for the supported
  Main Quad → Grainger demo trip. An empty Google result stays an empty result.
- The adapter requires a separate team routing access code in addition to exact
  origin checks. PostgreSQL-backed limits apply across teammates and server
  instances, survive restart, and reserve estimated cost before each call.
  See `../api-server/ROUTING_SAFETY.md` for required setup, default limits,
  approval requirements, and the distinction from Google's actual invoice.

## Verification and next step

The uploaded module's 27 offline tests passed. Integration checks use mocked
upstream responses and never call Google. Frontend and backend builds and
TypeScript checks passed.

The teammate's successful live report does not establish a successful Replit
Routes request. The next action is explicit approval for **one** potentially
billable Main Quad → Grainger request. Do not run the ZIP's live-test script,
toggle the routing switch, or make a live request before approval.
