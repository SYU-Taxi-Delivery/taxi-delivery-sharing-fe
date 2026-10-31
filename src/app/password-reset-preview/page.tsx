import { PasswordResetPreview } from "./PasswordResetPreview";
import { safeNextPath } from "@/features/auth/auth";

export const metadata = { robots: { index: false, follow: false } };

export default async function PasswordResetPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { mode, next } = await searchParams;
  const previewMode = mode === "reset" ? "reset" : "request";
  return (
    <PasswordResetPreview
      key={previewMode}
      mode={previewMode}
      next={safeNextPath(next)}
    />
  );
}
