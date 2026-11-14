import type { Metadata } from "next";
import { AdminScreen } from "@/features/admin/AdminScreen";

export const metadata: Metadata = {
  title: "신고 관리 | 두유팟",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminScreen />;
}
