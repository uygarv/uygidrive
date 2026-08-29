import { DriveWorkspace } from "@/components/drive/drive-workspace";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("Shared with me") };

export default function SharedPage() {
  return <DriveWorkspace initialSection="shared" />;
}
