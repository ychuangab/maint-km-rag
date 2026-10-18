#!/bin/bash
# 重建說明簡報：bash slides-src/build.sh
# Marp 產生 public/slides/index.html，再用 Playwright 列印成 public/slides/deck.pdf
set -e
cd "$(dirname "$0")/.."
npx -y @marp-team/marp-cli@4 slides-src/deck.md --no-stdin --html --allow-local-files -o public/slides/index.html
python3 - "$PWD" <<'PY'
import sys
from playwright.sync_api import sync_playwright
root = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(f"file://{root}/public/slides/index.html")
    pg.wait_for_timeout(1200)
    pg.pdf(path=f"{root}/public/slides/deck.pdf", prefer_css_page_size=True, print_background=True)
    b.close()
PY
