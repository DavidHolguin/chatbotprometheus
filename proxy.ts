import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // /api/auth/* — siempre pasar (callbacks de auth, guest route, etc.)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Construir respuesta base y cliente Supabase SSR (refresca JWT en cookies)
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANTE: usar getUser() (no getSession()) para validar el JWT
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  // Usuario autenticado (no anónimo) intentando acceder a login/register → home
  if (user && !user.is_anonymous && isAuthPage) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  // Sin sesión en rutas protegidas → guest auth para crear sesión anónima automáticamente
  if (!user && !isAuthPage) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);
    return NextResponse.redirect(
      new URL(
        `${base}/api/auth/guest?redirectUrl=${redirectUrl}`,
        request.url
      )
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
