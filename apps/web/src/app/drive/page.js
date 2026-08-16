import { DriveWorkspace } from "@/components/drive/drive-workspace";

export const metadata = { title: "My Drive | UygiDrive" };

export default function DrivePage() {
  return <DriveWorkspace initialSection="drive" />;
}
