import { cookies } from "next/headers";
import { MarketingHome } from "@/components/marketing-home";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has("uygidrive_session");

  return <MarketingHome hasSession={hasSession} />;
}
