"""第二步：由 patterns.json 組出虛構維護履歷與評測題，結果固定（random seed）。

輸出：
- data/records.json：維護履歷，網頁與檢索使用
- data/eval.json：評測題與標準答案（每題應找到的列號）

執行：python3 data-src/make_records.py
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rng = random.Random(7)

PLANTS = ["一廠", "二廠", "三廠"]
# 三廠沒有這些設備，用來測「同廠查無、改列他廠經驗」
NOT_IN_PLANT3 = {"輸送帶", "天車", "鍋爐"}
ZONES = ["A 區", "B 區", "公用區"]


def plants_for(equipment):
    return PLANTS[:2] if equipment in NOT_IN_PLANT3 else PLANTS


def rand_date():
    start = date(2023, 1, 1)
    return (start + timedelta(days=rng.randrange(0, 1000))).isoformat()


def main():
    groups = json.loads((ROOT / "data-src" / "patterns.json").read_text(encoding="utf-8"))
    records, pattern_rows = [], {}
    for g in groups:
        for pi, p in enumerate(g["patterns"]):
            pid = f"{g['code']}-{pi + 1}"
            pattern_rows[pid] = []
            for _ in range(rng.randint(3, 5)):
                plant = rng.choice(plants_for(g["equipment"]))
                unit = rng.randint(1, 3)
                lo, hi = sorted(p["downtime"][:2]) if len(p["downtime"]) >= 2 else (30, 120)
                # 原因與處理配對：原因 i 對應處理 i，第三種處理視為通用作法，有時一併執行
                ci = rng.randrange(min(2, len(p["causes"])))
                actions = [p["actions"][ci]] + ([p["actions"][2]] if len(p["actions"]) > 2 and rng.random() < 0.35 else [])
                records.append({
                    "plant": plant,
                    "zone": rng.choice(ZONES),
                    "equipment": g["equipment"],
                    "equip_code": f"{g['code']}-{PLANTS.index(plant) + 1}0{unit}",
                    "date": rand_date(),
                    "symptom": rng.choice(p["symptoms"]),
                    "cause": p["causes"][ci],
                    "action": "；".join(actions),
                    "downtime_min": rng.randrange(lo, hi + 1, 5) if hi > lo else lo,
                    "_pattern": pid,
                })

    # 依日期排序後編列號，列號就像 Excel 履歷的行號
    records.sort(key=lambda r: (r["date"], r["equip_code"]))
    for i, r in enumerate(records, 1):
        r["id"] = f"R{i:04d}"
        pattern_rows[r["_pattern"]].append(r["id"])

    # 評測題：每種設備取 2 型，各出直接問法與換句話說兩題
    questions = []
    for g in groups:
        for pi in rng.sample(range(len(g["patterns"])), 2):
            p, pid = g["patterns"][pi], f"{g['code']}-{pi + 1}"
            for style in ("direct", "paraphrase"):
                questions.append({
                    "q": p[f"q_{style}"],
                    "style": style,
                    "equipment": g["equipment"],
                    "pattern": p["name"],
                    "expected": pattern_rows[pid],
                })

    # 範圍題：問三廠沒有的設備，應該回答他廠經驗並明說
    scope = []
    for g in groups:
        if g["equipment"] in NOT_IN_PLANT3:
            p = g["patterns"][0]
            pid = f"{g['code']}-1"
            name = p["name"] if p["name"].startswith(g["equipment"]) else g["equipment"] + p["name"]
            scope.append({"q": f"三廠的{name}怎麼處理？", "plant": "三廠", "expected": pattern_rows[pid]})

    off_topic = ["今天中午要吃什麼？", "幫我寫一首關於秋天的詩", "明天會下雨嗎？"]

    out_records = [{k: v for k, v in r.items() if k != "_pattern"} | {"pattern": r["_pattern"]} for r in records]
    (ROOT / "data" / "records.json").write_text(json.dumps(out_records, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "data" / "eval.json").write_text(
        json.dumps({"questions": questions, "scope": scope, "off_topic": off_topic}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(len(records), "records,", len(questions), "questions,", len(scope), "scope")


if __name__ == "__main__":
    main()
