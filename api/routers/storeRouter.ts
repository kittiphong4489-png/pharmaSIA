/**
 * ============================================================
 * api/routers/storeRouter.ts — Store Profile & Settings
 * ============================================================
 * - ข้อมูลร้าน (ชื่อ ที่อยู่ เวลาทำการ)
 * - รูปภาพร้าน + ใบอนุญาต
 * - อีเมลร้าน (สำหรับ security alerts)
 * - โปรโมชั่น/แบนเนอร์
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";

// ── Store Profile Type ──
export interface StoreProfile {
  id: string;
  storeName: string;
  storeNameEn: string;
  storePhoto: string;         // รูปหน้าร้าน
  licenseNumber: string;      // เลขที่ใบอนุญาต ภก.๕
  licensePhoto: string;       // รูปใบอนุญาต
  pharmacistName: string;     // ชื่อเภสัชกร
  pharmacistLicense: string;  // เลขที่ใบประกอบวิชาชีพ
  pharmacistPhoto: string;    // รูปเภสัชกร
  address: string;
  phone: string;
  email: string;              // อีเมลร้าน (สำหรับ alerts)
  openHours: string;
  closeHours: string;
  openDays: string;           // จ-อ-พ-พฤ-ศ-ส-อา
  gpsLat: number | null;
  gpsLng: number | null;
  description: string;        // คำอธิบายร้าน
  motto: string;              // สโลแกนร้าน
  verified: boolean;          // ยืนยันแล้วหรือไม่
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Banner/Promotion Type ──
export interface StoreBanner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  position: "home_top" | "home_mid" | "sidebar";
  active: boolean;
  order: number;
  createdAt: string;
}

// ── In-memory storage (will persist to file in production) ──
let storeProfile: StoreProfile = {
  id: "store-001",
  storeName: "ร้านขายยาพิมลมาศ",
  storeNameEn: "Pimolmas Pharmacy",
  storePhoto: "",
  licenseNumber: "ภก.๕ มุกดาหาร 001/2567",
  licensePhoto: "",
  pharmacistName: "",
  pharmacistLicense: "",
  pharmacistPhoto: "",
  address: "189 ถนนสถลมารค ตำบลมุกดาหาร อำเภอเมืองมุกดาหาร จังหวัดมุกดาหาร 49000",
  phone: "042-611-XXX",
  email: "",  // รอตั้งค่า
  openHours: "08:00",
  closeHours: "20:00",
  openDays: "จันทร์-เสาร์",
  gpsLat: 16.5453,
  gpsLng: 104.7236,
  description: "ร้านขายยาที่ได้มาตรฐาน จำหน่ายยาของแท้ 100% มีเภสัชกรประจำร้านให้คำปรึกษา",
  motto: "ยาของแท้ ราคายุติธรรม บริการด้วยใจ",
  verified: true,
  verifiedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let banners: StoreBanner[] = [];

// ── tRPC Router ──
export const storeRouter = createRouter({
  // ── Get store profile (public) ──
  profile: publicQuery.query(async () => {
    return storeProfile;
  }),

  // ── Update store profile (admin) ──
  update: publicQuery
    .input(
      z.object({
        storeName: z.string().optional(),
        storeNameEn: z.string().optional(),
        storePhoto: z.string().optional(),
        licenseNumber: z.string().optional(),
        licensePhoto: z.string().optional(),
        pharmacistName: z.string().optional(),
        pharmacistLicense: z.string().optional(),
        pharmacistPhoto: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        openHours: z.string().optional(),
        closeHours: z.string().optional(),
        openDays: z.string().optional(),
        gpsLat: z.number().nullable().optional(),
        gpsLng: z.number().nullable().optional(),
        description: z.string().optional(),
        motto: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      storeProfile = { ...storeProfile, ...input, updatedAt: new Date().toISOString() };
      return storeProfile;
    }),

  // ── Get banners (public) ──
  banners: publicQuery.query(async () => {
    return banners.filter((b) => b.active).sort((a, b) => a.order - b.order);
  }),

  // ── Create banner (admin) ──
  createBanner: publicQuery
    .input(z.object({
      title: z.string().min(1),
      imageUrl: z.string().min(1),
      linkUrl: z.string().default(""),
      position: z.enum(["home_top", "home_mid", "sidebar"]).default("home_top"),
      order: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const banner: StoreBanner = {
        id: `ban-${Date.now()}`,
        ...input,
        active: true,
        createdAt: new Date().toISOString(),
      };
      banners.push(banner);
      return banner;
    }),

  // ── Toggle banner active (admin) ──
  toggleBanner: publicQuery
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const b = banners.find((x) => x.id === input.id);
      if (b) b.active = input.active;
      return b ?? null;
    }),

  // ── Delete banner (admin) ──
  deleteBanner: publicQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      banners = banners.filter((x) => x.id !== input.id);
      return { success: true };
    }),

  // ── Upload image (FormData) — replaces old base64 endpoint ──
  uploadImage: publicQuery
    .input(z.object({
      url: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Deprecated: use POST /api/upload/image directly instead
      // Kept for backward compatibility — returns the URL if provided
      return { success: true, imageUrl: input.url || "" };
    }),
});
