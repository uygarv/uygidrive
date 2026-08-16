import { DriveWorkspace } from "@/components/drive/drive-workspace";

export const metadata = { title: "Trash | UygiDrive" };

export default function TrashPage() {
  return <DriveWorkspace initialSection="trash" />;
}
