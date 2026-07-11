/**
 * api/lib/forteStockHelper.ts
 * Forte Stock Helper — หาจำนวนสต๊อกจาก Forte เบื้องหลัง
 * 
 * วิธี: ลอง scrape หน้าสินค้าแต่ละตัวจาก Forte โดยตรง
 * (Forte เป็น ASP.NET Web Forms → อาจมี stock ในหน้า product detail)
 */

const FORTE_BASE = "https://fmuk.foret.co.th";

const CHROME_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "Connection": "keep-alive",
};

/**
 * ลอง scrape stock จาก Forte product page
 * Returns: { stock: number, source: string } หรือ null
 */
export async function guessForteStock(sessionId: string, prodcode: string): Promise<{ stock: number; source: string } | null> {
  const methods = [
    () => scrapeProductDetail(sessionId, prodcode),
    () => scrapeProductTable(sessionId, prodcode),
  ];

  for (const method of methods) {
    try {
      const result = await method();
      if (result !== null) return result;
    } catch {}
  }
  
  return null;
}

/**
 * วิธี 1: ลองดูหน้า detail ของสินค้า (อาจมี stock balance)
 */
async function scrapeProductDetail(sessionId: string, prodcode: string): Promise<{ stock: number; source: string } | null> {
  // ลอง URL ต่างๆ ที่ Forte อาจมี
  const urls = [
    `${FORTE_BASE}/pages/product/product_detail.aspx?prodcode=${prodcode}`,
    `${FORTE_BASE}/pages/product/ProductDetail.aspx?prodcode=${prodcode}`,
    `${FORTE_BASE}/pages/inventory/stock_balance.aspx?prodcode=${prodcode}`,
    `${FORTE_BASE}/pages/inventory/StockBalance.aspx?prodcode=${prodcode}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { ...CHROME_HEADERS, "Cookie": `ASP.NET_SessionId=${sessionId}` },
        signal: AbortSignal.timeout(8000),
      });
      
      if (!res.ok) continue;
      const html = await res.text();
      
      // Look for common stock patterns
      const patterns = [
        /(?:(?:stock|สต็อก|จำนวนคงเหลือ|จำนวน)\s*[:=]?\s*)(\d+)/i,
        /(?:quantity|qty|on.?hand|balance)\s*[:=]?\s*(\d+)/i,
        /(<[^>]*>\s*)(\d+)\s*(?:<[^>]*>)\s*(?:ชิ้น|รายการ|หน่วย)/i,
        /class="[^"]*stock[^"]*"[^>]*>(\d+)</i,
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const qty = parseInt(match[1], 10);
          if (!isNaN(qty) && qty >= 0) {
            return { stock: qty, source: url };
          }
        }
      }
    } catch {}
  }
  
  return null;
}

/**
 * วิธี 2: ดูจาก product_table.aspx (อาจมี stock เป็นคอลัมน์ hidden)
 */
async function scrapeProductTable(sessionId: string, prodcode: string): Promise<{ stock: number; source: string } | null> {
  // Try fetching the product table page with the product filter
  try {
    const res = await fetch(`${FORTE_BASE}/pages/product/product_table.aspx`, {
      headers: { ...CHROME_HEADERS, "Cookie": `ASP.NET_SessionId=${sessionId}` },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!res.ok) return null;
    const html = await res.text();
    
    // Look for stock data embedded in the table
    const patterns = [
      /prodcode["']?[^>]*>.*?(\d+)(?:\s*ชิ้น|\s*รายการ)/i,
      /data-stock["']?=\s*["']?(\d+)/i,
      /(?:stock|qty|quantity)["']:\s*(\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const qty = parseInt(match[1], 10);
        if (!isNaN(qty) && qty >= 0) {
          return { stock: qty, source: "product_table.aspx" };
        }
      }
    }
  } catch {}
  
  return null;
}

/**
 * API Endpoint: ลองหา stock จาก Forte
 * ใช้เรียกตอน sync เพื่อลอง guess stock
 */
export async function tryFetchStockBatch(sessionId: string, products: { prodcode: string }[]): Promise<Map<string, number>> {
  const stockMap = new Map<string, number>();
  const batchSize = 5;
  
  for (let i = 0; i < Math.min(products.length, 20); i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const promises = batch.map(async (p) => {
      const result = await guessForteStock(sessionId, p.prodcode);
      if (result !== null) {
        stockMap.set(p.prodcode, result.stock);
      }
    });
    await Promise.all(promises);
    // Delay between batches
    await new Promise(r => setTimeout(r, 2000));
  }
  
  return stockMap;
}
