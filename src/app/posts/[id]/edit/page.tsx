import type { Metadata } from "next";
import { PostFormScreen } from "@/features/posts/form/PostFormScreen";

export const metadata: Metadata = { title: "모집글 수정 | SYU 택시·배달 공유" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostFormScreen mode="edit" postId={id} />;
}
