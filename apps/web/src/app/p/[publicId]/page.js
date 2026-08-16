import { FileAccessLoader } from "@/components/file-access-loader";
import { generateShareMetadata } from "@/lib/share-metadata";

export async function generateMetadata({ params }) {
  const { publicId } = await params;

  return generateShareMetadata("public", publicId);
}

export default async function PublicSharePage({ params }) {
  const { publicId } = await params;
  return <FileAccessLoader type="public" accessId={publicId} />;
}
