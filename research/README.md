# iSense GitHub 对齐版 v2.3

## 新增：自动日照参与实验性推荐

用户已批准自动预测与推荐。现在获取真实 Google 候选路线后，浏览器后台线程会
使用同一个历史地形缓存和 NOAA/DSM 射线模型自动计算；不再要求手动导入才可用于推荐。
模型完整覆盖的结果作为 **预计直射日照百分比** 接入现有权重和接受程度罚则，
保留额外步行上限。没有增加 Google API 请求或在线预测服务；路线与位置不发送到新服务。

3.8 MB 审阅缓存已保存到 Replit App Storage，模型代码运行在浏览器 Worker。
API 仅提供固定、带内容哈希的公开地形文件，不接收路线、不执行 Python、不绕过路由预算。
Worker 与主线程都校验结果绑定；路径、精确时长、出发时间变化即重算。
修改偏好只在本地更新排序，不重新请求 Google 路线或运行地形模型。

路线详情新增 **Automatic sunlight · historical terrain model**。
不足覆盖、低太阳高度、资源失败、超时或不匹配结果不进入实验性日照评分，
继续保留原有未知数据的保守处理。模型覆盖率不等于预测准确率。

历史冬季 LiDAR 尚未经现场校准。现有研究协议的 `rankingEligible=false` 仍表示
它不是已验证的感官证据；app 单独采用用户批准的实验性策略，不把它改成已验证。
下方 v2.3 原始交接说明中的“只显示、不参与排名”仍适用于 **手工导入研究文件**，
不再描述新接入的自动推荐。详见 [自动预测说明](../docs/AUTOMATIC-SUNLIGHT.md)。

本次基于 `chocolatte-tracy/iSense-uiuc` 的 `main`，提交
`2aa91962a2ce31816da195eb229bfe7a85a604ab`。这是实际新版 React 19 / TypeScript / pnpm
项目的增量修改，不再把旧版 React/Vite 原型当成最新版 app。

## 现在可以做什么

在已有 Google 候选路线的详情页，展开 **Offline sunlight research**：

1. 点 **Export route for offline prediction**，下载 `isense-route-request.json`。
2. 在本机离线运行下方 Python 命令。
3. 回到同一条路线，选择 **Import offline prediction JSON** 导入结果。

界面显示历史地形模型的直射日照比例、分钟数、覆盖率和快照出发时间。预测不随当前时钟刷新。
无需新增 API key、服务器接口或付费请求；获取原本的 Google 路线仍遵循项目现有授权和预算规则。
只有 Google 路线显示此入口；原 demo 路线不开放导出。全部文件处理在本机/浏览器内进行，
不自动上传、不写入数据库、不保存到 localStorage。关闭详情、切换路线或刷新页面后需重新导入。

```sh
python3 research/prediction/app_routes.py \
  --request /absolute/path/isense-route-request.json \
  --output /absolute/path/isense-sunlight-result.json
```

本 Replit 项目保留既有 Python 3.13。研究依赖已通过 Replit 的依赖管理安装，
并记录在根目录 `pyproject.toml` 和 `uv.lock`；不用创建或激活虚拟环境。
为兼容 Python 3.13，将附件的 `pyproj==3.6.1` 调整为 `pyproj==3.7.2`，
其余研究依赖与附件一致，未修改前后端 pnpm 依赖或锁文件。
独立电脑可使用 `prediction/requirements-lock.txt` 安装研究依赖。

依赖安装需要网络；安装后这条预测命令离线工作。命令从仓库根目录运行。
附件的原始地形数据及 SHA-256 元数据已复制到本工作区，不必重新下载。
较大的 `campus-grid.npz`、`dsm.tif`、`dtm.tif` 只保存在本地，已排除在 Git 和部署之外；
在另一个工作区运行前，必须从同一交接 ZIP 恢复这些文件到 `research/prediction/data/`。
不要把运行 `acquire.py --online` 当成缺失缓存的自动替代步骤。
当前模型只覆盖 Main Quad 周边约 1.2 × 1.2 km 地形窗口；校园范围内但地形支持不足的部分报告 unknown。

## 与上一版代码的关键差异

| 项目 | 旧 v2.2 交付 | 当前仓库与 v2.3 处理 |
|---|---|---|
| 前端 | 旧功能分支 React/Vite 原型 | 使用 GitHub 现有 React 19、TypeScript、pnpm 工作区 |
| 路线坐标 | 预测要求 `[经度, 纬度]` | app 实际为 `[纬度, 经度]`，仅在导出边界转换一次 |
| 路线形状 | 默认三条诊断直线，不保证可走 | 从 `DemoRoute.coordinates` 导出完整候选路径，不用稀疏 waypoints 替代 |
| 行程时长 | `durationMinutes` | 使用 `durationSeconds`，保留到毫秒，避免显示取整影响计算 |
| 出发时间 | 独立 CLI 默认时间 | 使用实际 `SunContext.departureTime`，规范化为 UTC 时间戳 |
| 结果匹配 | routeId / 独立文件 | 形状、时长、出发时间 SHA-256 绑定；ID 重用不会误配 |
| 推荐算法 | 旧报告适配器，另有固定时间尺度 | 不接入旧评分器，保留仓库现有时间归一化、硬性额外时间上限、阈值和未知处理 |
| 模型结果 | 离线报告 | 路线详情可查看离线预测；不修改成本、sensoryEvidence、舒适度或排序 |
| 人流 | Melbourne 实验模型 | 保留研究代码；不将外地小时流量当成 UIUC 人数密度/实时拥挤度 |

本次重点是上一版**预测实验**与当前 app 的对接。旧包的噪音/树木/月度人流管道、旧 frontend
和旧评分桥没有整体复制到新版仓库；它们仍保留在先前 v2.2 交付中。本包不宣称已把所有历史管道合并。

## 为什么预测暂不影响推荐

- 地形是 2019-11-23 至 2020-03-08 冬季采集，2 m 重采样。不能视为当前树冠或真实遮阴测量。
- 仅估计 300 m 射线范围内、离地 1.5 m 的遮挡；不预测云、温度、UV 或热舒适度。
- 采用恒定步速沿途计算太阳位置；夜间单独计入 `night`，不能称作树荫。
- 覆盖率 100% 只表示模型有数据支持，不等于准确率 100%。上下界仅反映缺失支持，不是置信区间。
- 缺少现场遮阴标签，尚未验证路线预测误差，也未建立经过校准的 0–100 舒适度映射。
- Melbourne 模型在未见过的计数站上表现差，不能直接移植成 UIUC 预测。

`rankingEligible` 强制为 false。导入器仅接收本包已审阅地形缓存哈希、固定模型版本和物理单位，
拒绝伪装为 route_index / people_per_hour 的文件。绑定能检测误配与意外修改，不能证明文件的发布者身份。
`geometryStatus=complete_verified` 沿用旧模型协议，表示来自 app 适配器的完整路径声明，
**不是现场核验过的可通行/无障碍路线**。

## 数据与实验文件

- `prediction/app_routes.py`：新版 app 导出格式的离线入口。
- `prediction/shade.py`：原有太阳位置 / DSM 射线算法。
- `prediction/data/`：官方 Champaign DSM/DTM 子集、元数据及哈希。
- `prediction/crowd.py`：原有外地小时流量训练、评估和 UIUC 15 分钟 CSV 验证代码。
- `prediction/MODEL_CARD.md`：模型假设、旧实验结果及限制。
- `prediction/DATA_SOURCES.md`：来源、归属、使用约束。

Melbourne 原始缓存、训练参数、逐条预测没有放进此 GitHub 对齐包，避免自动公开转发尚未明确再分发许可的材料。
旧实验结果摘要明确标为 v2.2 的历史实验，没有在本次重新训练。
`acquire.py --online` 会显式联网；不要为了打开 app 而运行。完整 crowd / report 流程需要先自行取得相应缓存。
本次离线日照功能不依赖 Melbourne 文件。

## 验证与测试

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
scripts/node_modules/.bin/tsx --test --test-reporter=spec \
  artifacts/api-server/src/lib/*.test.ts artifacts/api-server/src/lib/*.test.mjs \
  artifacts/quiet-campus/src/lib/*.test.ts
python3 -m unittest discover -s research/prediction/tests -v
scripts/node_modules/.bin/tsx research/prediction/tests/app_roundtrip.ts "$(command -v python3)"
PORT=21714 BASE_PATH=/ pnpm --filter @workspace/quiet-campus run build
pnpm --filter @workspace/quiet-campus run verify:pwa
pnpm --filter @workspace/api-server run build
```

Node 测试使用项目既有开发数据库配置，不覆盖连接配置或生产密钥。
PostgreSQL 集成测试使用独立随机测试 ID，并清理自己的测试记录。
若另一个环境没有可用数据库，应单独报告该集成测试未验证，不能把模拟测试当成持久化证明。

当前 Replit 环境：Linux、Node.js 24.13.0、pnpm 10.26.1、Python 3.13.11。
使用既有 Linux pnpm 安装树，没有改前后端 Node 依赖、pnpm-lock 或安全策略。

`VALIDATION.md` 保留附件作者的原始验证报告，不代表本 Replit 工作区的测试结果。
本工作区的测试、浏览器验证和完整文件清单见 `REPLIT-VALIDATION.md`。
Google 付费路线、生产部署、实际手机外部导航和现场预测精度不属于这次离线验证。
