import { FileAccessLoader } from "@/components/file-access-loader";
import { generateShareMetadata } from "@/lib/share-metadata";

export async function generateMetadata({ params }) {
  const { token } = await params;

  return generateShareMetadata("private", token);
}


export default async function PrivateSharePage({ params }) {
  const { token } = await params;
  return <FileAccessLoader type="private" accessId={token} />;
}
