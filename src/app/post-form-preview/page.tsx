import { notFound } from "next/navigation";
import { PostFormPreview } from "./PostFormPreview";

export default function PostFormPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PostFormPreview />;
}
