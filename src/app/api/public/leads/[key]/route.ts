import { NextResponse, type NextRequest } from "next/server";
import { businessByFormKey, clientIp, createWebsiteLead, hostAllowed, normalize } from "@/lib/intake";

/*
 * Public lead intake endpoint: POST /api/public/leads/{formKey}
 *  - JSON body, or a normal HTML form post (urlencoded / multipart)
 *  - Field names are flexible (name / first_name, email, phone, service, message, utm_*)
 *  - HTML forms can include _redirect=https://yoursite.com/thanks to go back to your site
 */

function cors(req: NextRequest, allowed: boolean) {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req, true) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const business = await businessByFormKey(key);
  if (!business) return NextResponse.json({ ok: false, error: "Form not found or disabled" }, { status: 404, headers: cors(req, true) });

  const origin = req.headers.get("origin");
  if (!hostAllowed(business, origin))
    return NextResponse.json({ ok: false, error: "This website is not allowed to submit to this form" }, { status: 403, headers: cors(req, false) });

  const type = req.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> = {};
  let isHtmlForm = false;
  try {
    if (type.includes("application/json")) {
      const body = await req.json();
      raw = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    } else {
      const form = await req.formData();
      isHtmlForm = true;
      form.forEach((v, k) => {
        if (typeof v === "string") raw[k] = v;
      });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the request body" }, { status: 400, headers: cors(req, true) });
  }

  const channel = raw._channel === "site" ? "site" : "api"; // "site" = the Nucleus website template
  const result = await createWebsiteLead(business, normalize(raw), { ip: clientIp(req.headers), channel });

  const redirectTo = typeof raw._redirect === "string" ? raw._redirect : null;
  if (isHtmlForm && redirectTo && /^https?:\/\//.test(redirectTo) && hostAllowed(business, redirectTo)) {
    const url = new URL(redirectTo);
    if (!result.ok) url.searchParams.set("error", result.error);
    return NextResponse.redirect(url, 303);
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: cors(req, true) });
  return NextResponse.json({ ok: true, id: result.leadId }, { status: 201, headers: cors(req, true) });
}
