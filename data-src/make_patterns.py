"""第一步：請 Gemini 產生各設備的故障型態，存成 data-src/patterns.json（只需跑一次，結果進版控）。

內容全為虛構。執行：python3 data-src/make_patterns.py（讀 .env.local 的 GEMINI_API_KEY）
"""
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = "gemini-3.8-flash"

EQUIPMENT = [
    ("空壓機", "AC", "螺旋式空氣壓縮機"),
    ("冷卻水塔", "CT", "開放式冷卻水塔，含風扇、灑水與補水系統"),
    ("冰水主機", "CH", "離心式冰水主機"),
    ("輸送帶", "CV", "皮帶輸送機，含驅動馬達、滾筒與張力裝置"),
    ("射出成型機", "IM", "油壓式塑膠射出成型機"),
    ("包裝機", "PK", "自動封箱與貼標包裝機"),
    ("堆高機", "FL", "電動堆高機"),
    ("天車", "CR", "橋式起重機"),
    ("鍋爐", "BL", "燃氣蒸汽鍋爐"),
    ("真空幫浦", "VP", "乾式螺桿真空幫浦"),
    ("純水系統", "RO", "RO 逆滲透純水系統"),
    ("廢氣洗滌塔", "SC", "濕式廢氣洗滌塔"),
]

PROMPT = """你是工廠設備維護專家。請為「{name}」（{desc}）設計 6 種常見、彼此明顯不同的故障型態，用來建立虛構的維護履歷資料庫。

每一型輸出：
- name：故障型態名稱（10 字內）
- symptoms：4 種「現場技術員填寫異常內容」的寫法，口語、簡短、可含警報代碼或數值，彼此用詞要有差異
- causes：2 種可能原因
- actions：3 種處理方式，每種是一句具體作法，含零件或參數（例如「更換油過濾器，排氣溫度由 108°C 降至 86°C」）
- downtime：典型停機分鐘數範圍 [最小, 最大]
- q_direct：維護人員會怎麼問這個問題（可以沿用履歷用詞）
- q_paraphrase：同一問題的換句話說，刻意避開 symptoms 的關鍵字，改描述現象或感受

全部使用繁體中文，內容虛構，不提及任何真實公司或品牌。"""

SCHEMA = {
    "type": "object",
    "properties": {
        "patterns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "symptoms": {"type": "array", "items": {"type": "string"}},
                    "causes": {"type": "array", "items": {"type": "string"}},
                    "actions": {"type": "array", "items": {"type": "string"}},
                    "downtime": {"type": "array", "items": {"type": "integer"}},
                    "q_direct": {"type": "string"},
                    "q_paraphrase": {"type": "string"},
                },
                "required": ["name", "symptoms", "causes", "actions", "downtime", "q_direct", "q_paraphrase"],
            },
        }
    },
    "required": ["patterns"],
}


def api_key():
    for line in (ROOT / ".env.local").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    return os.environ["GEMINI_API_KEY"]


def generate(eq):
    name, code, desc = eq
    body = {
        "contents": [{"role": "user", "parts": [{"text": PROMPT.format(name=name, desc=desc)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": SCHEMA,
            "temperature": 0.9,
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={api_key()}"
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return {"equipment": name, "code": code, "patterns": json.loads(text)["patterns"][:6]}
        except Exception as e:  # noqa: BLE001
            print(name, "retry", attempt, e)
    raise RuntimeError(name)


if __name__ == "__main__":
    with ThreadPoolExecutor(6) as ex:
        out = list(ex.map(generate, EQUIPMENT))
    (ROOT / "data-src" / "patterns.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(sum(len(e["patterns"]) for e in out), "patterns")
