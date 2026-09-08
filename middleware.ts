import { NextResponse, type NextRequest } from "next/server";

/* Middleware exists here for one small job: tell the root layout which path is
 * being rendered.
 *
 * It cannot do the PIN check itself — middleware runs on the edge runtime,
 * where better-sqlite3 does not exist, so it cannot read the stored PIN. The
 * layout does the checking; it just needs to know whether the current request
 * IS the unlock page, or it would redirect /unlock to itself forever.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-arsu-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    /* Everything except Next's own assets and the favicon. */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
