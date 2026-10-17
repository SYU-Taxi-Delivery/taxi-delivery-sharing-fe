import { notFound } from "next/navigation";
import { SignupPreview } from "./SignupPreview";

export default function SignupPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SignupPreview />;
}
