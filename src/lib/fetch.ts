/**
 * Safe fetch — ทุก fetch call ต้องใช้ฟังก์ชันนี้
 * - เช็ค res.ok
 * - parse error จาก JSON
 * - throw Error พร้อม message
 * - return parsed JSON
 */
export async function safeFetch(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown Error" }));
    throw new Error(error.message || `HTTP Error ${res.status}`);
  }
  return await res.json();
}
