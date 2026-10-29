import { notFound } from "next/navigation";
import { CommentsPreview } from "./CommentsPreview";

export default function CommentsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CommentsPreview />;
}
