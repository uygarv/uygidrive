import { DriveWorkspace } from "@/components/drive/drive-workspace";
import { brandTitle } from "@/config/brand";

export const metadata = { title: brandTitle("Trash") };

export default function TrashPage() {
  return <DriveWorkspace initialSection="trash" />;
}
