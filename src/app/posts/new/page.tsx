import type { Metadata } from "next";
import { PostFormScreen } from "@/features/posts/form/PostFormScreen";

export const metadata: Metadata = { title: "모집글 작성 | SYU 택시·배달 공유" };

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type } = await searchParams;
  return (
    <PostFormScreen
      mode="create"
      initialType={type === "DELIVERY" ? "DELIVERY" : "TAXI"}
    />
  );
}
