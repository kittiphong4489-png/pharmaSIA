/**
 * api/lib/resetAdminPw.ts — One-time password reset for Railway
 */
import { getDb } from "../queries/connection";
import { hashPassword } from "./auth";

export async function resetAdminPassword(newPassword: string, secret: string) {
  if (secret !== "pharmacia-reset-2026") throw new Error("Invalid secret");
  const hashed = hashPassword(newPassword);
  const db = getDb();
  db.prepare("UPDATE users SET passwordHash = ? WHERE role = 'SELLER' OR role = 'ADMIN'").run(hashed);
  const users = db.prepare("SELECT id, email, role FROM users WHERE role = 'SELLER' OR role = 'ADMIN'").all() as any[];
  return { success: true, updated: users.length, users: users.map((u: any) => ({ email: u.email, role: u.role })) };
}
