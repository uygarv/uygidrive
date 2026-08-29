import { AuthPage } from "@/components/auth/auth-page";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("Sign in") };

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
