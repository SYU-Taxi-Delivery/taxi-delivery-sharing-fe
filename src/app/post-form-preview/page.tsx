import { PostFormPreview } from "./PostFormPreview";

export const metadata = { robots: { index: false, follow: false } };

export default async function PostFormPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { mode, type } = await searchParams;
  const initialMode = mode === "edit" ? "edit" : "create";
  const initialType = type === "DELIVERY" ? "DELIVERY" : "TAXI";
  return (
    <PostFormPreview
      key={initialMode + initialType}
      initialMode={initialMode}
      initialType={initialType}
    />
  );
}
