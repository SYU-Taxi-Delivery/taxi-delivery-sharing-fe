import { parseMyTab } from "@/features/my/myHistory";
import { MyPreview } from "./MyPreview";

export const metadata = { robots: { index: false, follow: false } };

export default async function MyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <MyPreview tab={parseMyTab((await searchParams).tab)} />;
}
