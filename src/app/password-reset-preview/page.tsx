import { notFound } from "next/navigation";
import { PasswordResetPreview } from "./PasswordResetPreview";

export default async function PasswordResetPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode } = await searchParams;
  const previewMode = mode === "reset" ? "reset" : "request";
  return <PasswordResetPreview key={previewMode} mode={previewMode} />;
}
