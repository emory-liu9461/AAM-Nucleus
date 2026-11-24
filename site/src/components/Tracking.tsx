"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TAGS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];

/** Remembers how the visitor arrived (ad tags, landing page, referrer) for the quote form. */
export function TrackAttribution() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search);
      const fresh = TAGS.some((t) => q.get(t));
      if (!fresh && sessionStorage.getItem("site_attr")) return;
      const attr: Record<string, string> = { page_url: location.href, referrer: document.referrer };
      TAGS.forEach((t) => { const v = q.get(t); if (v) attr[t] = v; });
      sessionStorage.setItem("site_attr", JSON.stringify(attr));
    } catch {}
  }, []);
  return null;
}

/** Google Analytics / Google Ads / Meta Pixel, only when their IDs are set in Nucleus. */
export function Analytics({ ga4, googleAds, metaPixel }: { ga4?: string; googleAds?: string; metaPixel?: string }) {
  const gid = ga4 || googleAds;
  const safe = (v?: string) => (v && /^[A-Za-z0-9-]+$/.test(v) ? v : undefined);
  const [g4, ads, px] = [safe(ga4), safe(googleAds), safe(metaPixel)];
  return (
    <>
      {gid && safe(gid) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${safe(gid)}`} strategy="afterInteractive" />
          <Script id="gtag" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());${g4 ? `gtag('config','${g4}');` : ""}${ads ? `gtag('config','${ads}');` : ""}`}</Script>
        </>
      )}
      {px && (
        <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${px}');fbq('track','PageView');`}</Script>
      )}
    </>
  );
}

/** Fires lead conversion events on the thank-you page. */
export function LeadConversion() {
  useEffect(() => {
    const w = window as unknown as { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void };
    w.gtag?.("event", "generate_lead");
    w.fbq?.("track", "Lead");
  }, []);
  return null;
}

/** Counts page views for the Nucleus dashboard. No cookies; a per-tab id groups one visit. */
export function TrackVisit({ endpoint }: { endpoint: string }) {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (window.self !== window.top) return; // the Nucleus live preview isn't a real visit
      let session = sessionStorage.getItem("site_session");
      const newSession = !session;
      if (!session) {
        session = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("site_session", session);
      }
      const attr = JSON.parse(sessionStorage.getItem("site_attr") || "{}");
      let source = attr.utm_source || (attr.gclid ? "google" : attr.fbclid ? "facebook" : "");
      if (!source && attr.referrer) {
        const host = new URL(attr.referrer).hostname.replace(/^www\./, "");
        source = /google\./.test(host) ? "google" : /facebook|instagram|fb\.com/.test(host) ? "facebook" : /bing\./.test(host) ? "bing" : host === location.hostname ? "direct" : host;
      }
      const body = JSON.stringify({ path: pathname, session, newSession, source: source || "direct" });
      if (!navigator.sendBeacon?.(endpoint, new Blob([body], { type: "text/plain" }))) fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {}
  }, [pathname, endpoint]);
  return null;
}
