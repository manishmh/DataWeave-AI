import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public routes (no auth required). Everything else requires a session.
const PUBLIC_ROUTES = ['/login', '/register', '/guest'];
// Auth routes that a logged-in user should be bounced away from.
const AUTH_ROUTES = ['/login', '/register'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Not configured yet → don't guard routes (avoids 500-ing every request).
  if (!url || !key) return response;

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() refreshes the session; do not put logic between this
  // and the redirects below.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    // Supabase unreachable — fail open rather than 500 every route.
    return response;
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname === p);

  // Not logged in + private route → send to login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in + on an auth page → send to the app.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/library';
    return NextResponse.redirect(url);
  }

  return response;
}
