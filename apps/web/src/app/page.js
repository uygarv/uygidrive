import { cookies } from "next/headers";
import { MarketingHome } from "@/components/marketing-home";

const SESSION_COOKIE = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "uygidrive_session";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE);

  return <MarketingHome hasSession={hasSession} />;
}
