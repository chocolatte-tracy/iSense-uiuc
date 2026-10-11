"""Render saved experiment results to a standalone, offline HTML report."""
import base64
import html
import json
import struct
import zlib
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shade import load_grid

ROOT=Path(__file__).resolve().parent


def png(rgb):
    h,w,_=rgb.shape
    def chunk(kind,data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    pixels=b''.join(b'\0'+row.tobytes() for row in rgb)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')


def chart(rows,station):
    rr=[r for r in rows if r['station']==station and r['date']<'2025-03-24']
    maximum=max(max(r['count'],r['prediction']) for r in rr)*1.08
    def line(key,color):
        # Break lines at missing hours rather than implying observed continuity.
        from datetime import datetime
        groups=[];group=[];last=None
        for r in rr:
            day=(datetime.fromisoformat(r['date'])-datetime(2025,3,17)).days
            hour=day*24+r['hour'];pt=f'{45+hour/167*685:.1f},{185-r[key]/maximum*150:.1f}'
            if last is not None and hour!=last+1:
                groups.append(group);group=[]
            group.append(pt);last=hour
        groups.append(group)
        return ''.join(f'<polyline fill="none" stroke="{color}" stroke-width="2" points="{" ".join(g)}"/>' for g in groups)
    return f'''<svg viewBox="0 0 760 225" role="img" aria-label="计数点 {station} 实测和预测曲线">
    <path d="M45 30V185H730" fill="none" stroke="#8d9b95"/>
    <text x="5" y="35">{maximum:.0f}</text><text x="20" y="188">0</text>
    {line('count','#176b51')}{line('prediction','#c76c24')}
    <text x="45" y="212">2025-03-17</text><text x="635" y="212">03-23</text>
    <text x="490" y="20" fill="#176b51">实测人次 / 小时</text><text x="630" y="20" fill="#c76c24">预测</text></svg>'''


def build():
    out=ROOT/'results'
    evaluation=json.loads((out/'crowd-evaluation.json').read_text())
    predictions=json.loads((out/'crowd-predictions.json').read_text())
    shade=json.loads((out/'shade.json').read_text())
    grid=load_grid()
    height=np.clip((grid.dsm-grid.dtm)/35,0,1)
    rgb=np.stack([225-170*height,235-115*height,227-115*height],axis=2)
    rgb[~np.isfinite(height)]=[245,210,210]
    raster=base64.b64encode(png(rgb.astype('uint8'))).decode()
    tr=Transformer.from_crs(4326,32616,always_xy=True)
    marks=[]
    for route in shade['routes']:
        for s in route['samples']:
            x,y=tr.transform(s['lon'],s['lat'])
            px=(x-grid.xmin)/(grid.xmax-grid.xmin)*600
            py=(grid.ymax-y)/(grid.ymax-grid.ymin)*600
            color={'sunlit':'#e57924','shaded':'#325abc','night':'#212c34','unknown':'#d63384'}[s['state']]
            marks.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="2.8" fill="{color}"/>')
    map_svg=f'<svg viewBox="0 0 600 600" role="img" aria-label="UIUC DSM 高度背景与三条诊断线"><image href="data:image/png;base64,{raster}" width="600" height="600"/>{"".join(marks)}<text x="14" y="25" fill="#142b22">N ↑ · 1.2 km × 1.2 km</text></svg>'
    test=evaluation['test'];rows=''
    for key,label in [('future_test','已有地点，未来日期'),('unseen_station_test','未见过的地点，未来日期')]:
        for model,title in [('baseline','星期＋小时均值'),('bestBoosting','Poisson 梯度提升')]:
            m=test[key][model]
            rows+=f'<tr><td>{label}</td><td>{title}</td><td>{m["rows"]:,}</td><td>{m["mae"]:.1f}</td><td>{m["wape"]*100:.1f}%</td></tr>'
    shade_rows=''.join(f'<tr><td>{html.escape(r["routeId"])}</td><td>{r["coverageFraction"]*100:.0f}%</td><td>{r["sunlitFractionBounds"][0]*100:.1f}%–{r["sunlitFractionBounds"][1]*100:.1f}%</td></tr>' for r in shade['routes'])
    doc=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>iSense · 公开数据预测实验 v2.2</title><style>
    *{{box-sizing:border-box}}body{{margin:0;background:#f3f5f1;color:#1f312b;font:16px/1.65 system-ui,sans-serif}}
    main{{max-width:1100px;margin:auto;padding:36px 24px}}h1{{font-size:34px;line-height:1.25}}h2{{font-size:23px;margin-top:0}}
    .eyebrow{{letter-spacing:.1em;color:#4d6e60}}.lead{{max-width:840px;font-size:18px}}
    section{{background:white;border:1px solid #dce4df;border-radius:14px;padding:24px;margin:22px 0}}
    .notice{{border-left:4px solid #c76c24;padding:12px 18px;background:#fff5e8}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}}
    table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #e0e7e2}}
    th{{color:#4d6e60}}svg{{width:100%;height:auto}}svg text{{font:13px system-ui}}a{{color:#176b51}}code{{font-size:13px;overflow-wrap:anywhere}}
    .scroll{{overflow:auto}}.muted{{font-size:14px;color:#56665f}}@media(max-width:760px){{.grid{{grid-template-columns:1fr}}main{{padding:20px 12px}}section{{padding:18px}}h1{{font-size:28px}}}}
    </style><main><div class="eyebrow">iSense / CODEx LOCAL EXPERIMENT / v2.2</div><h1>模型已经跑通，适用范围也经过检查</h1>
    <p class="lead">已读取 17,032 条真实小时行人计数和校园 1.2 公里见方的高程数据。已训练两种梯度提升配置，并与历史均值比较；校园遮阴采用几何模型计算。</p>
    <p class="notice"><strong>这是研究结果，不是已经部署的 UIUC 实时路线预测。</strong> 当前环境推荐评分仍不会自动采用这些结果。未修改缺少源码的最新版 Replit app。</p>
    <section><h2>人流：熟悉的地点可以预测，换地点误差很大</h2>
    <p>2025 年 1–2 月训练；3 月 1–16 日选模型；3 月 17–31 日测试。计数点 10、12 未参与训练和选型。按验证集 MAE，最终选择：<strong>星期＋小时历史均值</strong>。</p>
    <div class="scroll"><table><tr><th>测试场景</th><th>模型</th><th>记录数</th><th>MAE（人次/小时）</th><th>WAPE</th></tr>{rows}</table></div>
    <p class="muted">MAE 是平均绝对误差；WAPE 是绝对误差之和 / 实测人次之和，不是“准确率”，可以超过 100%。缺失小时未补成零；未加入天气、节假日或实时计数。验证集残差范围不构成有保证的预测区间。</p>
    <div class="grid"><div><h3>计数点 1 · 已参与训练</h3>{chart(predictions,1)}</div><div><h3>计数点 10 · 未参与训练</h3>{chart(predictions,10)}</div></div>
    <p>结论：这个模型不能直接预测 UIUC 或其他新地点。已提供 UIUC 15 分钟 CSV 导入器，等待取得本地历史计数后再训练和验证。</p></section>
    <section><h2>遮阴：真实校园高程上的诊断计算</h2><div class="grid"><div>{map_svg}<p class="muted">背景深色表示 DSM−DTM 更高；橙色：模型内直射日照，蓝色：模型内遮挡。三条直线用于算法检查，可能穿过建筑或草地，不是合法步行路线。</p></div><div>
    <p>诊断时刻：<strong>2026-06-21 10:00 CDT</strong>，每条线假设步行 5 分钟。按沿线行进时间更新太阳位置，接收高度 1.5 米，障碍搜索半径 300 米。</p>
    <div class="scroll"><table><tr><th>诊断线</th><th>模型覆盖</th><th>直射日照长度比例</th></tr>{shade_rows}</table></div>
    <p>范围只表示缺测覆盖，不包含模型误差。100% 覆盖不代表 100% 准确。</p>
    <p class="notice">数据采集于 2019-11-23 至 2020-03-08。冬季树冠不能代表夏季叶片；模型将表面当作不透明障碍，且不考虑 300 米外障碍、云量或透光率。需要实地验证后才可用于推荐。</p>
    <p>已提供完整路线输入接口；当前没有最新 Google 路线源码或已保存的完整路线，因此没有生成真实路线排名。</p></div></div></section>
    <section><h2>数据与下一步</h2><p><a href="https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/">Melbourne 小时行人计数</a>：8 个预先选定计数点，2025 年 1–3 月。接口许可字段为空，缓存和派生模型用于本地研究，未自动公开上传。</p>
    <p><a href="https://clearinghouse.isgs.illinois.edu/data/elevation/illinois-height-modernization-ilhmp">ISGS / USGS Champaign LiDAR</a>：源像元 2 英尺，当前实验重采样为 2 米；保留下载请求、SHA-256、坐标系和英尺到米转换。元数据注明无访问/使用限制。</p>
    <p>优先补齐：UIUC 15 分钟行人记录、真实路线完整几何、遮阴现场核对。噪音保持原有测量和代理证据，不因人流或遮阴模型跑通而变成真实分贝预测。</p>
    <p class="muted">完整机器可读结果：prediction/results/crowd-evaluation.json、shade.json；运行命令见项目 README。</p></section></main></html>'''
    (out/'report.html').write_text(doc)
    print(out/'report.html')


if __name__=='__main__': build()
