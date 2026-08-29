import { AuthPage } from "@/components/auth/auth-page";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("Create an account") };

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
