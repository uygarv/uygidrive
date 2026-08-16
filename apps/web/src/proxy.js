import { NextResponse } from "next/server";

const SESSION_COOKIE = "uygidrive_session";

/**
 * Next 16 renamed Middleware to Proxy. This is deliberately a fast cookie
 * presence check; the Drive workspace still verifies the cookie with the API
 * before it fetches any protected data. This is just for redirections and UI states.
 */
export function proxy(request) {
  const developmentMock = process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("mock") === "1";
  if (process.env.NEXT_PUBLIC_MOCK_DRIVE === "true" || developmentMock) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if ((pathname === "/drive" || pathname === "/trash") && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/drive", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/drive", "/trash", "/login", "/signup"],
};
