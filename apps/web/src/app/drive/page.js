import { DriveWorkspace } from "@/components/drive/drive-workspace";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("My Drive") };

export default function DrivePage() {
  return <DriveWorkspace initialSection="drive" />;
}
