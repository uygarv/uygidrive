import { AuthPage } from "@/components/auth/auth-page";

export const metadata = { title: "Create an account | UygiDrive" };

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
