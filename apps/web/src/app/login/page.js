import { AuthPage } from "@/components/auth/auth-page";

export const metadata = { title: "Sign in | UygiDrive" };

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
