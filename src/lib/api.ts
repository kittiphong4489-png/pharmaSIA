/**
 * lib/api.ts — Single Point of Truth สำหรับทุก API call
 *
 * กฎ:
 * 1. Auth ที่ถูกต้องเสมอ (Bearer token)
 * 2. Session ID แนบทุก request (X-Session-ID)
 * 3. Error ถูก parse + throw เสมอ
 * 4. GET สำหรับ query, POST สำหรับ mutation (auto-detect)
 */

import { getSessionId } from "./session";

export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem("pharma_token");
  const sessionId = getSessionId();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    "X-Session-ID": sessionId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  // Only set Content-Type for JSON (not FormData — browser sets boundary)
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // ── Intelligent method detection ──
  // 1. If method is explicitly set → use it
  // 2. If no method:
  //    a. Has body → POST
  //    b. No body → GET
  // 3. If URL contains /trpc/ and no body → force GET (tRPC query)
  let method = options.method;
  if (!method) {
    if (options.body) {
      method = "POST";
    } else {
      method = "GET";
    }
  }
  // Force GET for tRPC queries without body
  if (endpoint.includes("/trpc/") && !options.body && method === "POST") {
    method = "GET";
  }

  try {
    // ── Cache-busting: auto-add ?_t=timestamp for GET requests ──
    let finalEndpoint = endpoint;
    if (method === "GET" && !endpoint.includes("?_t=") && !endpoint.includes("&_t=")) {
      const sep = endpoint.includes("?") ? "&" : "?";
      finalEndpoint = `${endpoint}${sep}_t=${Date.now()}`;
    }

    const res = await fetch(finalEndpoint, { ...options, method, headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP Error ${res.status}`);
    }

    return data;
  } catch (error: any) {
    console.error(`[API Error] ${endpoint}:`, error?.message || error);
    throw error;
  }
}

/**
 * uploadImage — อัปโหลดไฟล์รูปภาพผ่าน FormData
 *
 * วิธีใช้:
 *   const url = await uploadImage(file);
 *   setLicenseUrl(url);
 *
 * @param file     File object จาก <input type="file">
 * @param field    ชื่อ field ใน FormData (default: "image")
 * @returns        Public URL ของรูปที่อัปโหลด
 */
export async function uploadImage(file: File, field: string = "image"): Promise<string> {
  const token = localStorage.getItem("pharma_token");
  const formData = new FormData();
  formData.append(field, file);

  const headers: Record<string, string> = {
    ...(token ? { Authorization: *** ${token}` } : {}),
  };

  try {
    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers,
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");
    }
    return data.url;
  } catch (error: any) {
    console.error("[uploadImage Error]:", error?.message || error);
    throw error;
  }
}
