import { PasswordResetPreview } from "./PasswordResetPreview";
import { safeNextPath } from "@/features/auth/auth";

export const metadata = { robots: { index: false, follow: false } };

export default async function PasswordResetPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return <PasswordResetPreview next={safeNextPath(next)} />;
}
