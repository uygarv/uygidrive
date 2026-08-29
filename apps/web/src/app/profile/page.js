import { ProfilePage } from "@/components/profile/profile-page";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("Profile") };

export default function Page() {
  return <ProfilePage />;
}
