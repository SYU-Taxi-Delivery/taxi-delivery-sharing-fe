import { notFound } from "next/navigation";
import { parsePostQuery } from "@/features/posts/posts";
import { PostsPreview } from "./PostsPreview";

export default async function PostsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PostsPreview query={parsePostQuery(await searchParams)} />;
}
