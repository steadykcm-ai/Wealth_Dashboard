import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);

  // 로그인 페이지는 항상 접근 가능
  if (requestUrl.pathname === "/login") {
    return NextResponse.next();
  }

  // Cron, 정적 리소스는 미들웨어 제외
  if (
    requestUrl.pathname.startsWith("/api/cron") ||
    requestUrl.pathname.startsWith("/_next") ||
    requestUrl.pathname.startsWith("/favicon") ||
    requestUrl.pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 세션 없으면 로그인 페이지로 리다이렉트
  if (!session) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(requestUrl.pathname)}`, requestUrl)
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
