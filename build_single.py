#!/usr/bin/env python3
"""把 prototype/ 的 index.html + css + js 打包成自包含单文件 HTML。"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
PROTO = ROOT / "prototype"
OUT = ROOT / "aigift-standalone.html"

html = (PROTO / "index.html").read_text(encoding="utf-8")
css = (PROTO / "css" / "styles.css").read_text(encoding="utf-8")
data_js = (PROTO / "js" / "data.js").read_text(encoding="utf-8")
app_js = (PROTO / "js" / "app.js").read_text(encoding="utf-8")

for f in (css, data_js, app_js):
    assert "</style" not in css.lower() and "</scri" not in (data_js + app_js).lower(), "内联内容含终止标签"

# 1) 内联 CSS
html = html.replace(
    '<link rel="stylesheet" href="css/styles.css" />',
    "<style>\n" + css + "\n</style>",
)
# 2) 内联 JS（保持 data.js 先于 app.js 的加载顺序）
html = html.replace(
    '<script src="js/data.js"></script>',
    "<script>\n" + data_js + "\n</script>",
)
html = html.replace(
    '<script src="js/app.js"></script>',
    "<script>\n" + app_js + "\n</script>",
)
# 3) 标题与标识
html = html.replace(
    "<title>AIGift · 礼物推荐小程序原型</title>",
    "<title>AIGift · AI 礼物推荐（单文件版）</title>",
)
html = html.replace(
    "<!-- 桌面舞台：品牌 + 手机框 -->",
    "<!-- AIGift 单文件自包含版：CSS/JS 已全部内联，双击即可运行 -->\n  <!-- 桌面舞台：品牌 + 手机框 -->",
)

# 校验：不再引用本地相对资源
leftover = re.findall(r'(?:src|href)="(?!https?://|data:|#)[^"]+"', html)
assert not leftover, f"仍存在本地资源引用: {leftover}"
# 校验：替换均生效
assert "<style>" in html and 'src="js/' not in html and 'href="css/' not in html

OUT.write_text(html, encoding="utf-8")
print(f"OK -> {OUT} ({OUT.stat().st_size} bytes)")
