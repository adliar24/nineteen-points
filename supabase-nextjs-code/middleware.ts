import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // Mengambil data user yang sedang login saat ini (Server Session)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Membaca path rute saat ini
  const currentPath = request.nextUrl.pathname;

  // Proteksi Rute: Jika user belum login dan mencoba mengakses dashboard/scanner/cards
  const isProtectedRoute = 
    currentPath.startsWith('/dashboard') || 
    currentPath.startsWith('/scanner') || 
    currentPath.startsWith('/cards');

  if (isProtectedRoute && !user) {
    // Redirect ke halaman login apabila sesi kosong
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Jika user sudah login dan mencoba mengakses halaman /login, arahkan langsung ke dashboard
  if (currentPath === '/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

// Menentukan rute mana saja yang diproses oleh middleware
export const config = {
  matcher: [
    /*
     * Mencocokkan semua rute request kecuali untuk:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
