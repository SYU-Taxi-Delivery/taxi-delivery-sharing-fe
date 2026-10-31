import { PostDetailPreview } from "./PostDetailPreview";

export const metadata = { robots: { index: false, follow: false } };

export default async function PostDetailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { postId } = await searchParams;
  const id = typeof postId === "string" ? postId : "preview-detail";
  return <PostDetailPreview key={id} postId={id} />;
}
