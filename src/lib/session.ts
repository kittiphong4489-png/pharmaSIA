/**
 * lib/session.ts — Source of Truth สำหรับ sessionId
 * 
 * sessionId คือ sess-xxxxx เท่านั้น
 * ห้ามนำ pharma_token มาปนเด็ดขาด
 */

const SESSION_KEY = "pharma_session";
const SESSION_PREFIX = "sess-";

export function getSessionId(): string {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid || sid.length > 50 || !sid.startsWith(SESSION_PREFIX)) {
    sid = SESSION_PREFIX + Date.now() + "-" + Math.random().toString(36).substring(2, 8);
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}
