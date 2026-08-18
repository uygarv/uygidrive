const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

export async function GET(request, { params }) {
  const { publicId } = await params;
  const target = new URL(`/v1/public/${encodeURIComponent(publicId)}/content${request.nextUrl.search}`, apiBaseUrl);
  return Response.redirect(target, 307);
}
