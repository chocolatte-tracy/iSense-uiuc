# iSense 昼夜阳光评分

## 行为

- 使用出发地点坐标，未选地点时使用 UIUC Main Quad 参考坐标。
- 所有日期和展示时间都按 `America/Chicago`，自动处理 CST/CDT；
  访问者手机所在时区不改变 UIUC 的日出、日落。
- 使用开源 **SunCalc 1.9.0** 在设备上计算每天的太阳事件，无网络查询、
  无 Google 请求、无固定 06:00/19:00 假设。
- 白天区间为 **日出时刻（含）到日落时刻（不含）**。
- 夜间：估计直射阳光为 0，Sun 的有效评分权重为 0，
  分母仅包含其他三个有效权重。Sun Acceptance 也按夜间的 0 检查。
- 不修改原始路线阳光估计，不修改保存的 Sun Importance、Sun Acceptance、
  锁定状态或总和 100% 的四项设置。
- 日出后恢复白天评分，午夜重新使用新日期；恢复前台也会刷新。
  计时器最多每 30 秒检查一次，并在最近的日出/日落边界触发。
- 若所有有效权重为 0，使用原有的最短时间排序和并列规则；
  噪音、人群的接受度以及额外步行分钟硬限制仍有效。
- 若日期、坐标或太阳计算不可用，明确提示并保留原有估计，不擅自假定夜间。

## 在 Replit Preview 测试（不需要付费 API）

仅开发版支持 `solarTime`，必须同时加 `preview=demo`。
公开生产构建忽略 `solarTime`；没有新增公共控制按钮或滑块。

打开现有 iSense Preview，将以下查询参数加在地址后：

**模拟白天：**

```text
?preview=demo&solarTime=2026-10-10T17%3A00%3A00Z
```

这是 2026-10-10 UIUC 当地中午 12:00 CDT。

**模拟夜间：**

```text
?preview=demo&solarTime=2026-10-10T05%3A00%3A00Z
```

这是同一天 UIUC 当地午夜 00:00 CDT。

1. 保留 Main Quad → Grainger，点击 **Find Routes**，显示三条研究 demo。
2. 在 **Preferences** 调整 Sun Importance 和 Sun Acceptance，并记下设置。
3. 在同一浏览器切换上述白天/夜间地址。指标显示 `Preview simulation`，
   并列出实际计算的日出、日落。
4. 夜间路线详情中的 Direct sunlight 为 0，不再宣传“更多树荫”的路线优势。
   Preferences 中保存的 Sun 百分比、接受度和锁定状态仍保持不变。
5. 再切回白天并点击 Find Routes，Sun 重新参与比较。
6. 删除 `solarTime` 恢复当前时间；保留 `preview=demo` 可继续关闭所有 Google
   地图、Places 搜索和路线调用。删除 `preview=demo` 才会读取正常 API 配置。

此模拟时间固定，不随实际时钟前进；正常模式自动更新。
不要仅凭某个默认偏好下推荐未改变判断失败：不同路线可能在昼夜都有同一最优解。

## 测试命令

```sh
scripts/node_modules/.bin/tsx --test artifacts/quiet-campus/src/lib/sun-context.test.ts
scripts/node_modules/.bin/tsx --test artifacts/quiet-campus/src/lib/trip-sun-*.test.ts
pnpm --filter @workspace/quiet-campus run typecheck
```

自动测试包括日出前一分钟、精确日出、中午、日落前一分钟、精确日落、
午夜、春秋夏令时切换、外地时区访问、保留偏好后恢复白天、全零有效权重、
夜间接受度、步行上限、来源数据不可变以及生产构建禁用模拟参数。

## 步行途中日出 / 日落提示

- 推荐、候选、所选路线对比及超出接受度 / 步行上限的路线详情均显示预计步行区间。
- 使用现有出发时刻，加上有效的 `durationSeconds`；没有有效秒数时，
  使用 `walkingTimeMinutes`。到达时间按实际经过的秒数计算，不按钟面时间相加。
- 使用同一出发地点坐标，逐个 UIUC 当地日期计算太阳事件，支持跨午夜、
  月 / 年边界、春季跳时与秋季重复时段。日期及 CST/CDT 始终显示，
  不受访问者设备时区影响。
- 提示出发后、预计到达时刻（含）之前的日出 / 日落；恰好在出发时发生的
  事件已决定出发昼夜状态，不再作为途中变化重复提示。
- 没有期间事件时显示“未预计跨过日出 / 日落”；缺失或无效的时间、坐标
  或太阳事件显示“估计不可用”，不当作没有变化。为防损坏数据卡住界面，
  超过 366 天的步行时长不进行逐日计算，明确标记不可用。
- 此提示仅使用本地 SunCalc 与已有路线时长，无额外网络请求。
  **评分仍只使用出发时刻的昼夜状态**，不按途中事件重新加权，
  不推断逐段树荫、天气、照明或安全条件，不改保存偏好、PWA 或授权。

## 计算来源与限制

- SunCalc: https://github.com/mourner/suncalc
- 算法参考：http://aa.quae.nl/en/reken/zonpositie.html
- 使用 SunCalc 标准视太阳地平线约 -0.833°；忽略局部地形和建筑遮挡、
  天气、树冠和眼睛感受。途中日出 / 日落只作时间提示，不代表逐段阳光暴露。
- 时间是天文估计，非现场观测。白天路线 Sun 数值仍保持其原有
  DEMO/观测来源标签；本功能没有制造实际树荫测量。
- 夜间“直射阳光为 0”不代表黑暗、低温、无 UV、无眩光或步行安全。
- 纯函数接受显式出发时刻，未来可接预约出发选择；
  当前公共界面仍仅按立即出发时刻评分。
- 开始修改前保留了相关源码 ZIP 快照，并确认现有 Git 检查点。
  没有手动切分支、创建提交、合并、发布或修改 Google 授权设置。
