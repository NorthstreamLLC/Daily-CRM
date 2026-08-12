/** @type {import('next').NextConfig} */
const nextConfig = {
  // The framework version is a free hint to anyone scanning for known bugs.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /* Search engines: do not index, cache, or take a snippet. This is
             the header form of the same instruction in the page metadata.
             A crawler that ignores robots.txt may still honour this, and it
             covers responses that carry no HTML at all - API routes, CSV
             exports - which metadata cannot reach. */
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },

          /* Nobody should be able to frame this. Without it, a hostile page
             can load the CRM in an invisible iframe and trick a signed-in rep
             into clicking things they cannot see. */
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

          // Do not leak our URLs - which contain player ids - to other sites.
          { key: "Referrer-Policy", value: "no-referrer" },

          // Browsers must not second-guess a declared content type.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Nothing here needs a camera, a microphone, or a location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },

          /* Force HTTPS for two years, including subdomains. Vercel already
             redirects, but this stops the very first request of a session
             from going out in plain text at all. */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },

      {
        /* Signed-in pages must never sit in a shared cache or a browser's
           back-forward store. Otherwise one rep's book can be served to the
           next person on a shared machine. */
        source: "/(today|book|stats|calendar|admin)/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
