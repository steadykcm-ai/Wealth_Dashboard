import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isDashboardOwner } from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const requestedNext = searchParams.get("next") || "/";
    const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

    const supabase = await createSupabaseServer();
    if (!code) {
      return NextResponse.redirect(new URL("/login?error=callback", request.url));
    }
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return NextResponse.redirect(new URL("/login?error=callback", request.url));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isDashboardOwner(user.id)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
    }

    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=callback", request.url));
  }
}
