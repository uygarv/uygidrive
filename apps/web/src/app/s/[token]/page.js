import { FileAccessLoader } from "@/components/file-access-loader";

export const metadata = { title: "Private file | UygiDrive" };

export default async function PrivateSharePage({ params }) {
  const { token } = await params;
  return <FileAccessLoader type="private" accessId={token} />;
}
