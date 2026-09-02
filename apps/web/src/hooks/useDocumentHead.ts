import { useEffect } from "react";

const SITE_NAME = "Bord";
const DEFAULT_OG_IMAGE = "/og-default.png";

export interface DocumentHeadOptions {
  /** Page-specific title. The site name is appended unless already present. */
  title: string;
  description: string;
  /** Root-relative canonical path, e.g. "/professionals/jane-doe". */
  path: string;
  /** Root-relative or absolute image URL. Defaults to the site's OG card. */
  image?: string;
  type?: "website" | "profile" | "article";
  jsonLd?: object | object[];
  /** True for pages that should never appear in search results (e.g. auth screens). */
  noindex?: boolean;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Sets per-route title, meta description, canonical link, Open Graph /
 * Twitter card tags, and optional JSON-LD — the SPA equivalent of static
 * per-page <head> tags, since every public route here is client-rendered.
 * Meta/canonical tags are singletons updated in place; JSON-LD scripts are
 * inserted fresh per page and removed on unmount so structured data never
 * accumulates across navigations.
 */
export function useDocumentHead(opts: DocumentHeadOptions): void {
  const serialized = JSON.stringify(opts);

  useEffect(() => {
    const origin = window.location.origin;
    const url = origin + opts.path;
    const image = opts.image ? (opts.image.startsWith("http") ? opts.image : origin + opts.image) : origin + DEFAULT_OG_IMAGE;
    const fullTitle = opts.title.includes(SITE_NAME) ? opts.title : `${opts.title} | ${SITE_NAME}`;

    document.title = fullTitle;
    upsertMeta("name", "description", opts.description);
    upsertMeta("name", "robots", opts.noindex ? "noindex, nofollow" : "index, follow");
    upsertCanonical(url);

    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", opts.description);
    upsertMeta("property", "og:type", opts.type ?? "website");
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", opts.description);
    upsertMeta("name", "twitter:image", image);

    const scripts: HTMLScriptElement[] = [];
    if (opts.jsonLd) {
      for (const item of Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd]) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.textContent = JSON.stringify(item);
        document.head.appendChild(script);
        scripts.push(script);
      }
    }

    return () => {
      for (const script of scripts) script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}
