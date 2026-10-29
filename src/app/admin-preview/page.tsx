import { notFound } from "next/navigation";
import { AdminPreview } from "./AdminPreview";

export default function AdminPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminPreview />;
}
