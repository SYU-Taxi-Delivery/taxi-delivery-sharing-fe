import { notFound } from "next/navigation";
import { parseMyTab } from "@/features/my/myHistory";
import { MyPreview } from "./MyPreview";

export default async function MyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MyPreview tab={parseMyTab((await searchParams).tab)} />;
}
