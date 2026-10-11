# iSense v2.3 离线日照整合：Replit 验证报告

日期：2026-10-11

## 范围与版本

- 当前工作在本地功能分支 `feature/isense-offline-sunlight-v23`。
- 没有部署、推送、重置、整包覆盖或合并到 `main`。
- 本轮没有修改 `main` 引用；开始时的本地 `main` 为
  `2b35e9fd4d2e4eea1a3a50084b77b26a71ebeac3`。
- 交接 ZIP 的 GitHub 基线为
  `2aa91962a2ce31816da195eb229bfe7a85a604ab`，不是本地 Git 历史的替换来源。
- 已阅读外部交接说明、研究 README、原始 VALIDATION 和 HANDOFF-MANIFEST。
  ZIP 中清单记录的 395 个文件均通过大小及 SHA-256 核验；
  合并前当前代码与原 EXPORT-MANIFEST 的文件哈希一致。
- 现有前端文件只增加路线详情入口；新增模块留在独立组件、适配器及研究目录中。
  85 个受保护的后端、路由模块、API 合约、评分、观测适配及 Node 依赖文件
  在合并后仍与基线逐字节相同。
- 没有改变环境变量、Google 密钥、授权开关、预算策略或数据库结构。
  `.replit` 的唯一修改是依赖安装器增加 `proj` 和 `glibcLocales` 系统包。
- Python 保持既有 3.13。为兼容该运行时，附件的 `pyproj==3.6.1`
  调整为 `3.7.2`；其余研究依赖与附件锁定版本一致。

## 在界面哪里使用

在 Google 候选路线的 **Routes → Details → Offline sunlight research** 中：

1. 点击 **Export route for offline prediction**，下载 `isense-route-request.json`。
2. 使用下面的离线 Python 命令计算。
3. 下载输出文件，在同一路线详情的 **Import offline prediction JSON** 中选择该文件。
4. 查看模型日照比例、分钟数、覆盖率、出发时间快照和限制说明。

```sh
python3 research/prediction/app_routes.py \
  --request /absolute/path/isense-route-request.json \
  --output /absolute/path/isense-sunlight-result.json
```

命令从仓库根目录运行，使用附件提供的本地地形缓存，不联网取得新数据。
如果在 Replit Shell 计算，需要先手动把下载的请求文件放入工作区；
建议放在已忽略的 `generated-artifacts/` 内。浏览器中的结果导入仅本地读取文件，
不自动上传，不存入 localStorage 或数据库。

### 数据边界

- 导出的是 `DemoRoute.coordinates` 中完整的 Google 返回路径，不是导航用的稀疏 waypoints。
- app 为 `[纬度, 经度]`，导出 GeoJSON 为 `[经度, 纬度]`，只转换一次。
- 不使用展示时取整的分钟数；按附件协议保留毫秒精度的时长及 UTC 出发时间。
- SHA-256 绑定使用完整顶点序列（按 `1e-7` 度规范化）、毫秒时长和出发时间。
  不依赖可能被 Google 重用的 route ID。
- 路线形状或时长更新会重建详情内的预测组件，旧文件也必须重新通过匹配验证。
- 显示的是预测文件的出发时间快照，不会随当前时钟自动改变。
- demo 路线不显示这些导出、导入控制。
- `rankingEligible` 强制为 `false`。结果不写入感官证据、舒适度阈值或推荐评分。
- 只接受审阅过的地形缓存哈希、模型版本和物理单位；拒绝冒充日照结果的人流/评分文件。
- 绑定用于检测误配及意外修改，不能证明文件发布者身份。
- `geometryStatus=complete_verified` 是沿用的协议名称，不代表现场通行或无障碍核验。

## 本工作区实际验证结果

环境：Linux、Node.js 24.13.0、pnpm 10.26.1、Python 3.13.11。

| 检查 | 结果 |
|---|---|
| `pnpm run typecheck` | 通过，包含工作区库、前端、API 和 scripts |
| Node 回归及新适配器测试 | **147 通过，0 失败，0 跳过** |
| 开发 PostgreSQL 集成 | 通过：并发预留互斥、重新创建 handler 后计数保持、累计限额；测试使用独立随机 ID 并清理自己的记录 |
| Python 研究测试 | **28 通过，2 跳过，0 失败** |
| 地形来源哈希、英尺到米转换、网格范围 | 通过 |
| TypeScript → Python → TypeScript 往返 | 白天、夜间、夏令时 3 个快照通过；夜间不计为树荫，评分不变 |
| 前端生产构建 | 通过 |
| API 生产构建 | 通过 |
| PWA 静态验证 | 通过；15 项静态预缓存，0 外部资源，0 敏感凭据模式，没有新增 API/Maps 缓存 |
| 390×844 浏览器下载、Python 计算、文件导入 | 通过，使用真实应用、DetailsSheet 和文件控件 |
| 浏览器同 ID 时长变化后的旧文件拒绝 | 通过，无预测结果显示 |
| 浏览器路径更新后的旧文件拒绝及新文件恢复 | 通过 |
| 同 ID、同 200 秒时长、仅几何不同的实际 Python 输出 | 额外离线断言通过，拒绝匹配；单元测试也独立覆盖仅几何变化 |
| 浏览器无效 JSON、demo 路线控制隐藏 | 通过 |
| 导入/导出的网络及存储副作用 | 0 新增上传、0 额外 Routes 请求、localStorage 不变、推荐名称不变 |
| `git diff --check` | 通过 |

Python 跳过的是依赖 Melbourne 原始缓存和旧 crowd 预测输出的两项测试：
这些材料没有包含在交接包中，未下载、未重新训练，也未用于当前 UIUC 拥挤度。

### 浏览器验证说明

测试在真实 iSense 界面中使用 **合成、不可导航的测试几何**，通过既有 Google 响应适配器。
在页面加载前拦截 API 配置及所有 walking-routes POST，禁用该测试上下文中的地图、
Places 和 service worker，并阻止 Google/gstatic 资源。
这不是真实 Google 路线、实地精度或真机导航测试。

实际浏览器下载保存为 `generated-artifacts/isense-v23-browser/request.json`：

- 全部 3 个测试顶点已导出，顺序为 GeoJSON 的经度、纬度。
- `durationSeconds=185.25`，`durationMilliseconds=185250`。
- 实际出发时间为 `2026-06-21T15:02:45.389Z`。
- 运行本地 Python 后再通过文件控件导入，显示约 **53.3% 日照、1.6 分钟、
  100% 模型覆盖**。这些是合成几何上的模型输出，**不是测量或准确率**。
- 仅 3 次由测试操作主动发起的路线搜索，全部返回拦截器合成结果；
  导出、导入、拒绝及恢复不增加路线请求，也没有请求到达真实 Google。
- 第一轮测试拦截器误拦截 Vite 模块，出现 JSON MIME 错误；把拦截限定到根
  `/api/` 下的实际端点后解决。没有为此修改应用代码。

浏览器测试文件和保护文件哈希检查记录位于已忽略的
`generated-artifacts/isense-v23-browser/`，不是生产资源。

## 执行的主要命令

```sh
pnpm run typecheck

scripts/node_modules/.bin/tsx --test --test-reporter=spec \
  artifacts/api-server/src/lib/*.test.ts \
  artifacts/api-server/src/lib/*.test.mjs \
  artifacts/quiet-campus/src/lib/*.test.ts

python3 -m unittest discover -s research/prediction/tests -v
scripts/node_modules/.bin/tsx research/prediction/tests/app_roundtrip.ts "$(command -v python3)"

PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
pnpm --filter @workspace/api-server run build

python3 research/prediction/app_routes.py \
  --request generated-artifacts/isense-v23-browser/request.json \
  --output generated-artifacts/isense-v23-browser/result.json

python3 research/prediction/app_routes.py \
  --request generated-artifacts/isense-v23-browser/request-geometry.json \
  --output generated-artifacts/isense-v23-browser/result-geometry.json

git diff --check
```

`PORT` 和 `BASE_PATH` 仅用于构建子进程，没有保存或覆盖项目设置及密钥。
前端托管工作流已在代码批次完成后重启，成功启动。没有为了验证再次调用 Google。

## 完整变更清单

共 44 个修改/新增的代码、配置或文档文件（含本报告及 2 个项目约束记录），
另有 3 个本地地形二进制文件。用户原始附件不计作本轮代码修改。

### 修改已有文件

```text
.gitignore
.replit
.replitignore
README.md
artifacts/quiet-campus/src/components/routes-screen.tsx
pyproject.toml
uv.lock
```

- 路线详情文件只新增 import 和组件插入，共 2 行。
- Python 依赖记录和必要系统包让既有 Python 3.13 能运行离线工具。
- ignore 规则排除地形二进制、私有路线输出、Python 缓存和此次 ZIP。

### 新增前端适配及测试

```text
artifacts/quiet-campus/src/components/research-prediction-tools.css
artifacts/quiet-campus/src/components/research-prediction-tools.tsx
artifacts/quiet-campus/src/lib/research-prediction.test.ts
artifacts/quiet-campus/src/lib/research-prediction.ts
```

除附件实现外，导出器增加空 ID 及重复快照的提前拒绝，并增加相应测试。

### 新增研究代码、文档及测试

```text
research/README.md
research/VALIDATION.md
research/REPLIT-VALIDATION.md
research/prediction/DATA_SOURCES.md
research/prediction/MODEL_CARD.md
research/prediction/acquire.py
research/prediction/app_routes.py
research/prediction/crowd.py
research/prediction/diagnostic-transects.json
research/prediction/report.py
research/prediction/requirements-lock.txt
research/prediction/requirements.txt
research/prediction/shade.py
research/prediction/tests/app_roundtrip.ts
research/prediction/tests/test_app_routes.py
research/prediction/tests/test_artifacts.py
research/prediction/tests/test_prediction.py
research/prediction/uiuc-15minute-template.csv
```

研究模块及原始报告从附件原文选择性复制。README 和往返测试的命令适配 Replit；
研究锁定文件只调整 pyproj 兼容版本。crowd、acquire、report 留在研究目录，
没有接入应用人群评分、在线服务或自动下载。
`research/VALIDATION.md` 是附件作者原始报告；本文件才是当前工作区的实际结果。

### 新增地形元数据及来源记录

```text
research/prediction/data/campus-grid.json
research/prediction/data/dsm-export.json
research/prediction/data/dsm-export.json.source.json
research/prediction/data/dsm-service.json
research/prediction/data/dsm-service.json.source.json
research/prediction/data/dsm.tif.source.json
research/prediction/data/dtm-export.json
research/prediction/data/dtm-export.json.source.json
research/prediction/data/dtm-service.json
research/prediction/data/dtm-service.json.source.json
research/prediction/data/dtm.tif.source.json
research/prediction/data/lidar-metadata.xml
research/prediction/data/lidar-metadata.xml.source.json
```

### 新增本地地形文件，不进入 Git 或部署

```text
research/prediction/data/campus-grid.npz
research/prediction/data/dsm.tif
research/prediction/data/dtm.tif
```

合计 **7,204,991 字节**，内容及来源哈希没有改写。
新工作区只有 Git 源码时，需要从同一交接 ZIP 恢复这些缓存才能运行模型。

### 更新项目约束记录

```text
.agents/memory/MEMORY.md
.agents/memory/solar-trip-boundaries.md
```

记录离线研究不自动授权评分、在线服务或文件上传等后续改动。

## 没有验证的项目

- 真实付费 Google 路线请求、真实候选路线上的预测结果及生产配置。
- 当前线上站点是否运行此次改动；本轮没有发布，线上不会因此获得新代码。
- iPhone/Android 真机导入导出、外部导航和已安装 PWA 的更新过程。
- 历史地形对当前校园遮阴的实际预测精度。
- 未提供的 Melbourne 数据集及训练结果；未做新训练。

开发数据库集成已通过，没有本轮数据库阻塞。该结果不等于验证生产数据库。

## 还缺什么，才能可靠参与推荐

1. **当前且范围充分的 DSM/DTM、建筑和树冠资料**：
   目前只有 Main Quad 周边约 1.2×1.2 km、2019–2020 冬季地形；
   2 m 网格、300 m 射线范围无法覆盖所有校园路线或当前树叶/施工变化。
2. **UIUC 本地实地日照/遮阴标签**：
   需要沿路线、带坐标和时间，在不同季节、时段和天气采样；
   留出独立路线/日期验证模型误差，不能以数值覆盖率代替准确率。
3. **可信的天气与季节修正及步速假设验证**：
   当前不模拟云、叶片透光、温度、UV 或热舒适度，使用恒定步速。
4. **对现有感官成本和接受度的校准**：
   物理日照比例不能任意乘 100 当成舒适度；需验证映射、误差和缺失数据策略，
   再单独获批接入推荐算法。若要改善其他维度，还需本地时空匹配的噪音及
   同时在场人群数据，不能替用外地小时流量或 UIUC 月度计数。

在这些条件完成并获准前，继续保持研究展示与推荐评分分离。
