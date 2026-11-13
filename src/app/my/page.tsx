import type { Metadata } from "next";
import { parseMyTab } from "@/features/my/myHistory";
import { MyHistoryScreen } from "@/features/my/MyHistoryScreen";

export const metadata: Metadata = {
  title: "내 참여 · 모집 | 두유팟",
};

export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <MyHistoryScreen tab={parseMyTab((await searchParams).tab)} />;
}
