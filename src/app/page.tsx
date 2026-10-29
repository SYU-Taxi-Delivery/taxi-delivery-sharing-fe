import { LoginScreen } from "@/features/auth/LoginScreen";

export default function Home() {
  return <LoginScreen next="/posts" />;
}
