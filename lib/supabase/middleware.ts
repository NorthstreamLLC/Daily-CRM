import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the auth session on every request and guards the routes.
 *
 * Server Components cannot write cookies, so without this a session would
 * expire mid-use and the app would start behaving as if nobody was logged in.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /* Middleware runs before every page, so anything thrown here takes the whole
     site down with MIDDLEWARE_INVOCATION_FAILED - a 500 that names no cause.
     Missing configuration is the common way to get there, so say so plainly
     rather than crashing. */
  if (!url || !anonKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(" and ");

    return new NextResponse(
      `Not configured: ${missing} is missing.\n\n` +
        "On Vercel: Project > Settings > Environment Variables, add it for " +
        "Production, then redeploy - variables are baked in at build time, so " +
        "adding one to an existing deployment does nothing until it rebuilds.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* Do not remove: this call is what actually refreshes an expiring token.

     Wrapped because a network blip or a bad URL reaching Supabase would
     otherwise crash middleware and take down every route at once. Treating a
     failure as "not signed in" degrades to the login page, which is both safe
     and recoverable. */
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/reset-password") ||
    /* robots.txt has to be readable by a crawler that is, by definition, not
       signed in. Redirecting it to /login means the file is never delivered
       and the instruction never received - which defeats the point of having
       it. It gives nothing away: it names no paths, only "deny everything". */
    path === "/robots.txt";

  // Not signed in and asking for a real page - send them to log in.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  /* Hand the verified id to the page so it need not ask again.
  
     getUser() is a network call to Supabase Auth, and it was happening TWICE
     on every navigation: once here to guard the route, once inside getMe. The
     second one asks a question this one already answered.
  
     Safe because the header is written here, on the forwarded request, after
     verification - anything a client sent under the same name is overwritten,
     so it cannot be spoofed from outside. */
  {
    const headers = new Headers(request.headers);

    if (user) {
      headers.set("x-verified-user", user.id);
    } else {
      /* CRITICAL: strip it when there is NO verified user.
      
         Only setting it on the happy path leaves a hole - a request to a
         public route carrying a forged x-verified-user would pass straight
         through untouched, and getMe would believe it. Deleting it
         unconditionally means the header can only ever have been written
         here, after verification. */
      headers.delete("x-verified-user");
    }

    response = NextResponse.next({ request: { headers } });
    // Cookies set during the refresh above must survive being re-wrapped.
    for (const cookie of request.cookies.getAll()) {
      response.cookies.set(cookie.name, cookie.value);
    }
  }

  // Already signed in and sitting on the login page - send them onward.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  return response;
}
