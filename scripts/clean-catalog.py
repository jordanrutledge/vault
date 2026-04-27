#!/usr/bin/env python3
"""
Catalog data quality cleanup:
1. Fix duplicate brand prefix in chrono24 display_names ("Rolex Daytona Rolex Daytona\n...")
2. Extract canonical 'line' from fashionphile/rebag noisy Shopify titles
3. Mark display_name rows that are just model numbers / SKUs
"""
import re, json, os, time
from urllib.request import urlopen, Request
from urllib.error import URLError

SUPABASE_URL = "https://khbgwxhoxtdmkwcuwotc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoYmd3eGhveHRkbWt3Y3V3b3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA2ODI5MywiZXhwIjoyMDkyNjQ0MjkzfQ.RWI7cquUNpFJPg_5ApMmdGWlSouAYw5Jg8Cu2c_tuFo"

def sb_get(path, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{path}?{params}"
    req = Request(url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Accept": "application/json", "Prefer": "count=exact"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_patch(path, params, body):
    data = json.dumps(body).encode()
    url = f"{SUPABASE_URL}/rest/v1/{path}?{params}"
    req = Request(url, data=data, method="PATCH", headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"})
    with urlopen(req, timeout=30) as r:
        return r.status

# ── Known luxury model families for line extraction ──
# Pattern: regex to match in display_name → canonical line name
HANDBAG_LINES = [
    # Hermès
    (r'\bBirkin\b', 'Birkin'), (r'\bKelly\b', 'Kelly'), (r'\bConstance\b', 'Constance'),
    (r'\bBolide\b', 'Bolide'), (r'\bPicotin\b', 'Picotin'), (r'\bEvelyn\b', 'Evelyne'),
    (r'\bEvelyne\b', 'Evelyne'), (r'\bJige\b', 'Jige'), (r'\bLindy\b', 'Lindy'),
    (r'\bGarden Party\b', 'Garden Party'), (r'\bTrim\b', 'Trim'),
    # LV
    (r'\bNeverfull\b', 'Neverfull'), (r'\bSpeedy\b', 'Speedy'), (r'\bAlma\b', 'Alma'),
    (r'\bPochette Metis\b', 'Pochette Metis'), (r'\bPochette\b', 'Pochette'),
    (r'\bNoe\b', 'Noe'), (r'\bCapucines\b', 'Capucines'), (r'\bNano\b', 'Nano Speedy'),
    (r'\bOnthego\b', 'On The Go'), (r'\bOn The Go\b', 'On The Go'),
    (r'\bPalermo\b', 'Palermo'), (r'\bMontaigne\b', 'Montaigne'), (r'\bArtsy\b', 'Artsy'),
    (r'\bDelightful\b', 'Delightful'), (r'\bGalliera\b', 'Galliera'),
    # Chanel
    (r'\bClassic Flap\b', 'Classic Flap'), (r'\bClassic Double Flap\b', 'Classic Flap'),
    (r'\bBoy\b(?! Bag)', 'Boy Bag'), (r'\bBoy Bag\b', 'Boy Bag'),
    (r'\b2.55\b', '2.55'), (r'\bGST\b', 'GST'), (r'\bPST\b', 'PST'),
    (r'\bTimeless\b', 'Timeless Classic'), (r'\bWallet on Chain\b', 'Wallet on Chain'),
    (r'\bWOC\b', 'Wallet on Chain'), (r'\bDeauville\b', 'Deauville'),
    (r'\bFiesta\b', 'Fiesta'),
    # Gucci
    (r'\bMarmont\b', 'Marmont'), (r'\bDionysus\b', 'Dionysus'), (r'\bSoho\b', 'Soho'),
    (r'\bBamboo\b', 'Bamboo'), (r'\bHorseBit\b', 'Horsebit'), (r'\bHorse Bit\b', 'Horsebit'),
    (r'\bPadlock\b', 'Padlock'), (r'\bJackie\b', 'Jackie'),
    # Balenciaga
    (r'\bCity\b', 'City'), (r'\bPart Time\b', 'Part Time'), (r'\bFirst\b(?! Floor)', 'First'),
    (r'\bMotorcycle\b', 'City'), (r'\bPapier\b', 'Papier'), (r'\bHourglass\b', 'Hourglass'),
    # Prada
    (r'\bGalleria\b', 'Galleria'), (r'\bTessuto\b', 'Tessuto'), (r'\bSaffiano\b', 'Saffiano'),
    # Celine
    (r'\bLuggage\b', 'Luggage'), (r'\bClasp\b', 'Clasp'), (r'\bTrapeze\b', 'Trapeze'),
    (r'\bSoleil\b', 'Soleil'),
    # Dior
    (r'\bLady Dior\b', 'Lady Dior'), (r'\bSaddle\b', 'Saddle'), (r'\bBook Tote\b', 'Book Tote'),
    (r'\b30 Montaigne\b', '30 Montaigne'),
    # Saint Laurent
    (r'\bLoulou\b', 'Lou Lou'), (r'\bKate\b', 'Kate'), (r'\bSac de Jour\b', 'Sac de Jour'),
    (r'\bSulpice\b', 'Sulpice'),
    # Bottega Veneta
    (r'\bPouch\b', 'Pouch'), (r'\bCassette\b', 'Cassette'), (r'\bArco\b', 'Arco'),
    (r'\bJodie\b', 'Jodie'),
    # Goyard
    (r'\bSt Louis\b', 'St Louis'), (r'\bSaint Louis\b', 'St Louis'), (r'\bArtois\b', 'Artois'),
    (r'\bBellechasse\b', 'Bellechasse'),
    # Generic bag shapes as fallback
    (r'\bShoulder Bag\b', 'Shoulder Bag'), (r'\bTote\b', 'Tote'), (r'\bClutch\b', 'Clutch'),
    (r'\bCrossbody\b', 'Crossbody'), (r'\bBackpack\b', 'Backpack'), (r'\bSatchel\b', 'Satchel'),
    (r'\bHobo\b', 'Hobo'), (r'\bMinaudiere\b', 'Minaudiere'),
]

def extract_line_from_handbag_name(display_name):
    """Extract canonical model line from noisy Shopify title."""
    for pattern, line in HANDBAG_LINES:
        if re.search(pattern, display_name, re.IGNORECASE):
            return line
    return None

def clean_chrono24_name(display_name, brand):
    """Fix 'Rolex Daytona Rolex Daytona\nColor...' → 'Rolex Daytona'."""
    if not display_name:
        return display_name
    # Remove newline and everything after it
    name = display_name.split('\n')[0].strip()
    # Remove repeated brand+model prefix: "X Y X Y" → "X Y"
    words = name.split()
    if len(words) >= 4:
        half = len(words) // 2
        if words[:half] == words[half:half*2]:
            name = ' '.join(words[:half])
    # Strip trailing brand repetition: "Rolex Daytona Rolex" → "Rolex Daytona"
    brand_words = brand.split()
    for bw in brand_words:
        if name.lower().endswith(' ' + bw.lower()):
            name = name[:-(len(bw)+1)].strip()
    return name.strip()

def main():
    print("=== Catalog Data Quality Cleanup ===\n")

    # ── 1. Fix chrono24 display names ──
    print("1. Fetching chrono24 rows with repeated name prefix...")
    rows = sb_get("catalog", "source=eq.chrono24-kaggle&select=id,brand,display_name,line&limit=1000&offset=0")
    to_fix = []
    for r in rows:
        cleaned = clean_chrono24_name(r['display_name'], r['brand'])
        if cleaned != r['display_name']:
            to_fix.append((r['id'], cleaned))

    print(f"   Found {len(to_fix)} names to clean")
    fixed = 0
    for item_id, new_name in to_fix[:200]:  # cap at 200 per run
        try:
            sb_patch("catalog", f"id=eq.{item_id}", {"display_name": new_name})
            fixed += 1
            time.sleep(0.03)
        except Exception as e:
            print(f"   Error on {item_id}: {e}")
    print(f"   Fixed {fixed} chrono24 display names\n")

    # ── 2. Extract 'line' for fashionphile/rebag handbag rows missing it ──
    print("2. Extracting canonical line names for handbag rows...")
    sources = ["fashionphile", "rebag", "luxedh", "wrist-aficionado"]
    total_line_updates = 0
    for source in sources:
        offset = 0
        while True:
            rows = sb_get("catalog", f"source=eq.{source}&line=is.null&category=in.(Handbags,Accessories,Small Leather Goods)&select=id,brand,display_name&limit=500&offset={offset}")
            if not rows:
                break
            updates = 0
            for r in rows:
                line = extract_line_from_handbag_name(r['display_name'])
                if line:
                    try:
                        sb_patch("catalog", f"id=eq.{r['id']}", {"line": line})
                        updates += 1
                        time.sleep(0.02)
                    except Exception as e:
                        print(f"   Error: {e}")
            print(f"   {source}: updated {updates}/{len(rows)} rows at offset {offset}")
            total_line_updates += updates
            offset += 500
            if len(rows) < 500:
                break
    print(f"   Total line updates: {total_line_updates}\n")

    # ── 3. Fix display_name for rows where it IS the model number ──
    print("3. Fixing rows where display_name == model_number...")
    rows = sb_get("catalog", "select=id,brand,display_name,model_number,line&limit=100")
    sku_fixes = 0
    for r in rows:
        if r['display_name'] and r['model_number'] and r['display_name'].strip() == r['model_number'].strip():
            # Build a better name: brand + line (if exists) + model_number
            parts = [r['brand']]
            if r['line']:
                parts.append(r['line'])
            parts.append(r['model_number'])
            new_name = ' '.join(p for p in parts if p)
            try:
                sb_patch("catalog", f"id=eq.{r['id']}", {"display_name": new_name})
                sku_fixes += 1
            except Exception as e:
                print(f"   Error: {e}")
    print(f"   Fixed {sku_fixes} SKU-as-name rows\n")

    print("Done.")

if __name__ == "__main__":
    main()
