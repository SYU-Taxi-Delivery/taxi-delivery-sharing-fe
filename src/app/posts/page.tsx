import type { Metadata } from "next";
import { parsePostQuery } from "@/features/posts/posts";
import { PostListScreen } from "@/features/posts/PostListScreen";

export const metadata: Metadata = { title: "택시·배달 모집 | 두유팟" };

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PostListScreen query={parsePostQuery(await searchParams)} />;
}
