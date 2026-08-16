import { FileAccess } from "@/components/file-access";

function legacyUrl(path) {
  return `${(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "")}${path}`;
}

export default async function PublicFilePage({ params }) {
  const { user, path } = await params;
  return <FileAccess fileName={path.at(-1)} url={legacyUrl(`/public/${encodeURIComponent(user)}/${path.map(encodeURIComponent).join("/")}`)} isPrivate={false} />;
}
