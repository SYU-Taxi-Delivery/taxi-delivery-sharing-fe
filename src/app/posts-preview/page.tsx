import { parsePostQuery } from "@/features/posts/posts";
import { PostsPreview } from "./PostsPreview";

export const metadata = { robots: { index: false, follow: false } };

export default async function PostsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PostsPreview query={parsePostQuery(await searchParams)} />;
}
