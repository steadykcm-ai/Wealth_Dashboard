import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const requestUrl = new URL(request.url);

  // 로그인 페이지는 항상 접근 가능
  if (requestUrl.pathname === "/login") {
    return NextResponse.next();
  }

  // Cron, 정적 리소스, OAuth 콜백은 미들웨어 제외
  if (
    requestUrl.pathname.startsWith("/api/cron") ||
    requestUrl.pathname.startsWith("/_next") ||
    requestUrl.pathname.startsWith("/favicon") ||
    requestUrl.pathname.startsWith("/api/auth") ||
    requestUrl.pathname.startsWith("/auth/")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase authentication environment variables are missing" },
      { status: 500 }
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
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

  let user = null;
  try {
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Session check timeout")), 3000)
    );
    const { data } = await Promise.race([userPromise, timeoutPromise]);
    user = data.user;
  } catch {
    user = null;
  }

  if (!user) {
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
