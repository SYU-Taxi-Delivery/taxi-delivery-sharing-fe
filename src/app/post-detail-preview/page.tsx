import { notFound } from "next/navigation";
import { PostDetailPreview } from "./PostDetailPreview";

export default function PostDetailPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PostDetailPreview />;
}
