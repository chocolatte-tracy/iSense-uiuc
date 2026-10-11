# iSense 自动日照推荐

## 使用

1. 在 Map 中选择起点与终点，按 Find routes。
2. 现有 Google Routes 接口返回真实候选路径、精确秒数及距离。
3. 浏览器 Worker 自动加载经过 SHA-256 校验的历史地形缓存并计算整条路线。
4. Routes 顶部显示计算状态、完整模型覆盖的路线数及实验性说明。
5. 完整覆盖的结果立即参与现有排名；调节 Sunlight Importance 或独立接受程度后在本地重新排序。
6. Details → Automatic sunlight 查看比例、分钟数、覆盖率、UIUC 出发时间、是否参与排名和限制。

不需要再手动导出、运行 Python、导入。原手工流程仍保留作为研究工具，但其文件本身不参与排名。
现有演示路线不是完整 Google 路径，不应用真实地形预测。

## 排名规则

- 保留现有 weighted scoring、接受程度罚则、硬性额外步行上限及确定性平局处理。
- 日照项使用 `完整路线的预测直射长度比例 × 100`，即物理曝光百分比，而非经过校准的舒适度分数。
- 仅完整支持、绑定匹配的数值用于实验性比较；不足部分不会当作遮阴。
- 原始 `sunExposureCost`、噪音、人群及观测数据没有被改写成“真实模型观测”。
- 所有模型结果均为 provisional；覆盖率 100% 不代表准确率 100%。
- 夜间不是树荫；若全程夜间，原有日照权重排除继续生效。跨日出的完整行程预测不会因出发时是夜间而被忽略。
- 地形数据、资源或浏览器不支持时，明确报错并回到原有未知数据规则，不静默造分。

研究协议 `rankingEligible=false` 保留，表示缺乏现场验证。app 的实验性使用权限和研究模型的
验证状态是两件事；没有把预测伪装为团队审阅观测。

## 模型及隐私

与 `research/prediction/shade.py` 相同：
EPSG:32616 投影、NOAA 太阳位置、真北/网格北校正、5 m 弧长采样、
2 m DSM/DTM、300 m 射线、离地 1.5 m、恒定步速。浏览器保留 float64，
不使用稀疏 waypoints 替代整条路线。坐标仅在协议边界从 app 的纬经顺序转为 GeoJSON 经纬顺序。

2019-11 至 2020-03 冬季地形，约 1.2 km×1.2 km。太阳低于 10° 时未知；
未预测云、温度、UV、热舒适度或安全。没有使用 Melbourne 人流模型或 UIUC 月度计数作为实时拥挤度。
来源：USGS、ISGS/Prairie Research Institute/UIUC；重用限制见 research/prediction/DATA_SOURCES.md。

路线与计算留在当前浏览器，不上传至 App Storage、不写数据库或 localStorage。
App Storage 只保存公开历史地形。公开 GET：

`/api/sunlight-model/grid/109eca2ad7406836a932d1d50297488ae60491a69efa4e099c08d6f4fd38b902`

这是静态模型资源，不是新的在线预测 API。路径固定，不允许用户查询任意对象。
缓存以内容哈希标识，避免以后模型版本变化却复用旧文件。
没有新增 Google Maps/Places/Routes 请求；既有 Google 路由开关、额度、预留和服务端保护不变。
App Storage 的使用属于 Replit 文件托管，不是 Google Routes 的计费请求。

## 配置与发布

无需新增 Google 密钥或改变现有 Google feature flags。已通过 App Storage 初始化并上传、
读取复核现有缓存。该平台初始化新增：
`DEFAULT_OBJECT_STORAGE_BUCKET_ID`、`PUBLIC_OBJECT_SEARCH_PATHS`、`PRIVATE_OBJECT_DIR`。
没有覆盖现有 Google 密钥。只读模型服务使用 `PUBLIC_OBJECT_SEARCH_PATHS` 和 Replit sidecar 授权；
不是使用 Maps 或 Routes 密钥访问存储。

本轮不自动发布、推送或合并 main。公开版本要使用此功能需 Republish，并确保发布环境
拥有同一 App Storage 的配置与访问权。未配置时返回 `SUNLIGHT_MODEL_UNAVAILABLE`，
UI 不声称预测已参与推荐。Python 和本地大栅格文件不需要加入生产镜像。

缓存迁移到另一个项目时，使用平台 App Storage 配置后运行：

```sh
scripts/node_modules/.bin/tsx artifacts/api-server/src/scripts/seed-solar-grid.ts
```

该管理命令只上传现有审阅缓存并检验 SHA-256，不进行在线地形下载。
不要把它作为每次应用启动或每次查询时的操作。

## 验证与后续可靠性

本轮结果：
- 工作区类型检查、前端/后端构建与 PWA 检查通过。
- 完整 Node 离线回归 166 项通过，0 失败。
- Python 30 项中 28 项通过、2 项跳过（Melbourne 缓存/实验输出未包含在交接中）。
- 原研究导入/导出协议回归继续通过，自动模型使用真实缓存与 Python 逐项对照通过。
- App Storage 上传、回读及开发 API 资源 SHA-256 均通过，3,925,495 字节。
- 390×844 浏览器通过：完整 Worker 计算、日照/时间权重切换、硬性时间上限、
  导航交接 URL、形状/时长变化重算、部分覆盖及 503 回退、四标签与横向溢出检查。
- 浏览器路线接口全部为合成假响应；所有 Google 主机请求被拦截，没有真实 Google 路由请求。
- 未进行实体手机、发布后的生产、现场准确度或独立 31 秒超时等待验收。
- 首次 App Storage SDK 传输有非致命监听器数量警告；传输、资源服务及 SHA-256 校验成功，
  尚未对 SDK 内部监听器做专项调查。

新增离线测试验证日照改变推荐、独立接受程度、时间上限、旧结果失效、
跨日出、夜间/低太阳角度/缺失射线，以及真实缓存上与原 Python 的日间、夜间、
DST 和覆盖不足输出对照。浏览器验收使用明确标注的合成路线和被拦截的 Google 服务；
它不代表真实路径、实体手机、生产环境或现场准确度已经验证。

```sh
pnpm run typecheck
scripts/node_modules/.bin/tsx --test \
  artifacts/api-server/src/lib/*.test.ts artifacts/api-server/src/lib/*.test.mjs \
  artifacts/quiet-campus/src/lib/*.test.ts
python3 -m unittest discover -s research/prediction/tests -v
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
```

Python 对照需要本地已审阅的 campus-grid.npz；没有该文件时该集成测试明确跳过，
而纯逻辑测试仍运行。2 项外地人流实验因缓存/输出未交接而跳过，不影响本日照模型。

要用于有可信准确度的推荐，还需要 UIUC 不同季节、日期和时段的现场直射/遮阴标签，
更新树冠与建筑地形、路线/步速误差评估、云与天气资料，以及与感官用户一起校准曝光百分比
和接受程度的关系。当前功能是已启用的实验性比较，不能据此宣称舒适或安全保证。
