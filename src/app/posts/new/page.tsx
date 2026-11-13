import type { Metadata } from "next";
import { parseInitialPlaces } from "@/features/posts/form/postDraft";
import { PostFormScreen } from "@/features/posts/form/PostFormScreen";

export const metadata: Metadata = { title: "모집글 작성 | 두유팟" };

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PostFormScreen
      mode="create"
      initialType={params.type === "DELIVERY" ? "DELIVERY" : "TAXI"}
      initialPlaces={parseInitialPlaces(params)}
    />
  );
}
