import { notFound } from "next/navigation";
import { AuthPreview } from "./AuthPreview";

export default function AuthPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AuthPreview />;
}
