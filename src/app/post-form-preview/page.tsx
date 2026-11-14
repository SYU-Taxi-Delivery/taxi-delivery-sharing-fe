import { parseInitialPlaces } from "@/features/posts/form/postDraft";
import { PostFormPreview } from "./PostFormPreview";

export const metadata = { robots: { index: false, follow: false } };

export default async function PostFormPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { mode, type, postId } = params;
  const initialMode = mode === "edit" ? "edit" : "create";
  const initialType = type === "DELIVERY" ? "DELIVERY" : "TAXI";
  return (
    <PostFormPreview
      key={`${initialMode}${initialType}${postId ?? ""}`}
      initialMode={initialMode}
      initialType={initialType}
      postId={typeof postId === "string" ? postId : undefined}
      initialPlaces={parseInitialPlaces(params)}
    />
  );
}
