import type { MetadataRoute } from "next";

/**
 * Keep this out of every search index.
 *
 * The login wall is what actually protects the data - a crawler cannot read a
 * page it is not signed in for. This is about the layer above that: a site
 * that is never indexed is never found, never linked, and never probed by
 * whoever browses search results for exposed dashboards.
 *
 * robots.txt is a request, not a control. Well-behaved crawlers obey it;
 * hostile ones ignore it and read it as a map of what exists. So it stays
 * deliberately blunt - deny everything, name nothing - and the real work is
 * done by the X-Robots-Tag header, the noindex metadata, and the login.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
