const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

export async function GET(request, { params }) {
  const { token } = await params;
  const target = new URL(`/v1/s/${encodeURIComponent(token)}/content${request.nextUrl.search}`, apiBaseUrl);
  return Response.redirect(target, 307);
}
