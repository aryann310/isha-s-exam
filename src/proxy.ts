import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth/session'

const protectedRoutes = ['/exams', '/papers', '/exam', '/results', '/solutions']
const adminRoutes = ['/admin']

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route))
  const isAdminRoute = adminRoutes.some(route => path.startsWith(route))

  const session = request.cookies.get('session')?.value
  const decryptedSession = await decrypt(session)

  // Redirect root to exams or login
  if (path === '/') {
    if (decryptedSession) {
      if (decryptedSession.role === 'ADMIN') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      return NextResponse.redirect(new URL('/exams', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect to /login if not authenticated and trying to access a protected route
  if ((isProtectedRoute || isAdminRoute) && !decryptedSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect admin routes if not admin
  if (isAdminRoute && decryptedSession?.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/exams', request.url))
  }

  // /login is always reachable: the login page itself sends signed-in users on, after checking the
  // account in the database. Redirecting here on the cookie alone would loop for a revoked account.
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
