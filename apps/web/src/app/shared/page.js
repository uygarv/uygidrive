import { DriveWorkspace } from "@/components/drive/drive-workspace";

export const metadata = { title: "Shared with me | UygiDrive" };

export default function SharedPage() {
  return <DriveWorkspace initialSection="shared" />;
}
