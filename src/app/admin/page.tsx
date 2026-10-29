import type { Metadata } from "next";
import { AdminScreen } from "@/features/admin/AdminScreen";

export const metadata: Metadata = {
  title: "신고 관리 | SYU 택시·배달 공유",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminScreen />;
}
