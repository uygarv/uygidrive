import { FileAccessLoader } from "@/components/file-access-loader";

export const metadata = { title: "Shared file | UygiDrive" };

export default async function PublicSharePage({ params }) {
  const { publicId } = await params;
  return <FileAccessLoader type="public" accessId={publicId} />;
}
