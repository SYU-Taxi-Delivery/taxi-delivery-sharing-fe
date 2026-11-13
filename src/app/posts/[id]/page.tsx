import type { Metadata } from "next";
import { PostDetailScreen } from "@/features/posts/detail/PostDetailScreen";

export const metadata: Metadata = { title: "모집글 상세 | 두유팟" };

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostDetailScreen postId={id} />;
}
