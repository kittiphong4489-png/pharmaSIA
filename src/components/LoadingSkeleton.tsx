/**
 * LoadingSkeleton.tsx — Shimmer Effect Skeleton Component
 *
 * ใช้ครอบตอนโหลดข้อมูลเพื่อ UX ที่ลื่นไหล
 * ดีกว่าแสดง Spinning Wheel หรือหน้าเปล่าๆ
 */

import { type ReactNode } from "react";

interface SkeletonProps {
  className?: string;
  children?: ReactNode;
}

function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer rounded-lg bg-gradient-to-r from-gray-100 via-blue-50/60 to-gray-100 bg-[length:200%_100%] ${className}`}
    />
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-3 w-40" />
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2 animate-shimmer bg-gradient-to-r from-gray-100 via-blue-50/60 to-gray-100 bg-[length:200%_100%]">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-20" />
    </div>
  );
}

export function TableRowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function ProductListSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <Skeleton className="h-40 w-full rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
