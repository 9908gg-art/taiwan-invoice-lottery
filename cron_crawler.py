import urllib.request
import ssl
import re
import json
import os
from datetime import datetime

# Setup SSL bypass
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

def crawl():
    url = "https://invoice.etax.nat.gov.tw/index.html"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            html = response.read().decode('utf-8')
            
            # 1. Parse periods
            periods = re.findall(r'<a[^>]*class="etw-on"[^>]*>([^<]+)</a>', html)
            if not periods:
                print("Could not parse current period name.")
                return
            
            # Clean period name (e.g. "115年03-04月中獎號碼單" -> "115年03-04月")
            period_name = periods[0].replace("中獎號碼單", "").strip()
            print("Current Period:", period_name)
            
            # 2. Parse numbers
            p_blocks = re.findall(r'<p class="etw-tbiggest[^"]*">(.*?)</p>', html, re.DOTALL)
            if len(p_blocks) < 5:
                print("Could not find enough winning number blocks in HTML.")
                return
                
            winning_numbers = []
            for block in p_blocks[:5]:
                block_clean = re.sub(r'\s+', '', block)
                # Two-part
                match2 = re.search(r'<spanclass="fw-bold">(\d+)</span><spanclass="fw-boldetw-color-red">(\d+)</span>', block_clean)
                if match2:
                    winning_numbers.append(match2.group(1) + match2.group(2))
                else:
                    # Single-part
                    match1 = re.search(r'<spanclass="fw-boldetw-color-red">(\d+)</span>', block_clean)
                    if match1:
                        winning_numbers.append(match1.group(1))
                        
            if len(winning_numbers) < 5:
                print("Parsed winning numbers count is less than 5:", winning_numbers)
                return
                
            # Map numbers
            data = {
                "period": period_name,
                "super_prize": winning_numbers[0],   # 特別獎 (1000萬)
                "grand_prize": winning_numbers[1],   # 特獎 (200萬)
                "first_prizes": [winning_numbers[2], winning_numbers[3], winning_numbers[4]], # 頭獎 (20萬)
                "additional_six": [],                # 增開六獎
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            # Save to json file
            os.makedirs("data", exist_ok=True)
            with open("data/winning_numbers.json", "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print("Saved winning numbers successfully:", data)
            
    except Exception as e:
        print("Crawler error:", e)

if __name__ == "__main__":
    crawl()
