import { FileAccess } from "@/components/file-access";

function legacyUrl(path) {
  return `${(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "")}${path}`;
}

export default async function SharedFilePage({ params, searchParams }) {
  const { user, path } = await params;
  const { shareToken } = await searchParams;
  const filePath = path.map(encodeURIComponent).join("/");
  const token = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : "";
  return <FileAccess fileName={path.at(-1)} url={legacyUrl(`/shared/${encodeURIComponent(user)}/${filePath}${token}`)} isPrivate />;
}
