#!/usr/bin/env python3
import json, subprocess, sys

# Fetch pricing data
result = subprocess.run(["curl", "-s", "http://localhost:3000/api/seller/pricing"], capture_output=True, text=True)
data = json.loads(result.stdout)
cats = data.get("categories", [])
print(f"Total categories: {len(cats)}")
for c in cats[:2]:
    print(f"\nCategory: {c['categoryName']} ({c['count']} products, hasCost: {c['hasCost']})")
    for p in c["products"][:3]:
        print(f"  - {p['nameTh']}: cost={p['costPrice']}, price={p['price']}, profit={p.get('profit')}, margin={p['marginPercent']}%, unitPricing keys={list(p.get('unitPricing',{}).keys())}")

# Test updating a product with unit pricing
test_body = json.dumps({
    "price": 15,
    "costPrice": 10,
    "marginPercent": 50,
    "marginType": "percent",
    "unitPricing": {
        "piece": {"price": 15, "costPrice": 10},
        "pack": {"price": 120, "costPrice": 80},
        "box": {"price": 450, "costPrice": 300}
    }
})
result2 = subprocess.run(
    ["curl", "-s", "-X", "PUT", "-H", "Content-Type: application/json",
     "-d", test_body, "http://localhost:3000/api/seller/pricing/product/1"],
    capture_output=True, text=True
)
print(f"\nPUT result: {result2.stdout}")

# Verify saved data
result3 = subprocess.run(["curl", "-s", "http://localhost:3000/api/seller/pricing"], capture_output=True, text=True)
data3 = json.loads(result3.stdout)
for c in data3.get("categories", []):
    for p in c.get("products", []):
        if p["id"] == 1:
            print(f"\nVerified product 1: profit={p.get('profit')}, unitPricing={json.dumps(p.get('unitPricing'), ensure_ascii=False)}")
            break
