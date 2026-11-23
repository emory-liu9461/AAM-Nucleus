import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assistantEnabled, chatTurn } from "@/lib/assistant";
import { businessByFormKey, clientIp, hashIp, hostAllowed } from "@/lib/intake";
import { safeEqual } from "@/lib/auth";

/*
 * Website chat with the AI assistant.
 *   POST /api/public/chat/{formKey}
 *   { message, conversationId?, token?, attribution? } -> { reply, conversationId, token, status, booking? }
 * The token proves the browser owns the conversation.
 */

export const maxDuration = 60; // a turn with tool calls can take a few model round trips

const LIMITS = { messageChars: 1000, turnsPerChat: 40, newChatsPerIpPerHour: 10 };

function cors(req: NextRequest) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (req: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(req) });

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const b = await businessByFormKey(key);
  if (!b || !assistantEnabled(b)) return json(req, { error: "The assistant isn't available right now." }, 404);
  if (!hostAllowed(b, req.headers.get("origin"))) return json(req, { error: "Not allowed from this website." }, 403);

  let body: { message?: unknown; conversationId?: unknown; token?: unknown; attribution?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Couldn't read the request." }, 400);
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json(req, { error: "Type a message first." }, 422);
  if (message.length > LIMITS.messageChars) return json(req, { error: `Please keep messages under ${LIMITS.messageChars} characters.` }, 422);

  const ip = clientIp(req.headers);
  const ipHash = hashIp(ip);
  let conv;
  if (typeof body.conversationId === "string" && /^[0-9a-f-]{36}$/.test(body.conversationId)) {
    [conv] = await db
      .select()
      .from(schema.chatConversations)
      .where(and(eq(schema.chatConversations.id, body.conversationId), eq(schema.chatConversations.businessId, b.id)));
    if (!conv || typeof body.token !== "string" || !safeEqual(body.token, conv.token)) conv = undefined;
  }
  if (conv && conv.userTurns >= LIMITS.turnsPerChat)
    return json(req, { error: "This chat has reached its limit. Please call us or use the quote form." }, 429);

  if (!conv) {
    const hourAgo = new Date(Date.now() - 3600e3);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.chatConversations)
      .where(and(eq(schema.chatConversations.businessId, b.id), gte(schema.chatConversations.createdAt, hourAgo), sql`${schema.chatConversations.attribution}->>'ipHash' = ${ipHash}`));
    if (Number(n) >= LIMITS.newChatsPerIpPerHour) return json(req, { error: "Too many chats. Please call us or try again later." }, 429);
    const a = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
    const pick = (k: string) => (typeof a[k] === "string" ? (a[k] as string).slice(0, 500) : undefined);
    [conv] = await db
      .insert(schema.chatConversations)
      .values({
        businessId: b.id,
        token: randomBytes(24).toString("hex"),
        attribution: {
          channel: "chat", ipHash,
          utmSource: pick("utm_source"), utmMedium: pick("utm_medium"), utmCampaign: pick("utm_campaign"),
          gclid: pick("gclid"), fbclid: pick("fbclid"), page: pick("page_url"), referrer: pick("referrer"),
        },
      })
      .returning();
  }

  const result = await chatTurn(b, conv, message, ip);
  return json(req, { ...result, conversationId: conv.id, token: conv.token });
}
