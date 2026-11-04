import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are Island Express Customer Care, the helpful support assistant for a Seychelles marketplace.
Answer only using these facts and general safe guidance:
- Island Express helps customers discover and buy from local shops in Seychelles.
- The marketplace uses Seychelles Rupees (SCR).
- Customers can browse approved listings, add items to cart, save favourites, create accounts and view their orders.
- Sellers manage their own listings and fulfilment; customer support is handled by Island Express, not sellers through this chat.
- For a specific order, payment, refund, delivery status, account access or policy decision, do not guess or claim to have checked records. Ask for relevant non-sensitive details and offer human support.
- Never ask for passwords, full card details, one-time codes or secret credentials.
- Do not invent delivery fees, delivery times, refund guarantees, seller contact details or platform policies not provided here.
- Keep answers concise, warm and practical.
If you cannot confidently answer, say so and recommend a human support agent. If the customer asks for a human, acknowledge the request.`;

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Customer Care is not fully configured." }, { status: 503 });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
    if (!token) return NextResponse.json({ error: "Please sign in to use Customer Care." }, { status: 401 });
    const auth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const { conversationId } = await request.json();
    if (typeof conversationId !== "string") return NextResponse.json({ error: "Invalid support conversation." }, { status: 400 });
    const db = createClient(supabaseUrl, serviceKey);
    const { data: conversation, error: conversationError } = await db.from("support_conversations")
      .select("id,customer_id,status,handoff_requested").eq("id", conversationId).eq("customer_id", user.id).single();
    if (conversationError || !conversation) return NextResponse.json({ error: "Support conversation not found." }, { status: 404 });
    if (conversation.handoff_requested || conversation.status === "waiting_for_support" || conversation.status === "in_progress") {
      return NextResponse.json({ handoff: true, reply: "Your request is with our Customer Care team. A human support agent will reply here." });
    }
    if (!openAiKey) return NextResponse.json({ error: "The AI assistant is not configured yet. Please use Talk to a human." }, { status: 503 });

    const { data: messages, error: messagesError } = await db.from("support_messages")
      .select("sender_type,body").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(20);
    if (messagesError) return NextResponse.json({ error: "Unable to load your conversation." }, { status: 500 });
    const lastCustomer = [...(messages ?? [])].reverse().find(m => m.sender_type === "customer");
    if (!lastCustomer) return NextResponse.json({ error: "Send a message before asking the assistant." }, { status: 400 });
    const asksHuman = /\\b(human|person|agent|real person|customer care|customer support|speak to someone|talk to someone)\\b/i.test(lastCustomer.body);
    if (asksHuman) {
      await db.from("support_conversations").update({ handoff_requested: true, status: "waiting_for_support" }).eq("id", conversationId);
      const reply = "Of course. I've passed this conversation to our Customer Care team. A human agent will continue here.";
      await db.from("support_messages").insert({ conversation_id: conversationId, sender_type: "ai", sender_id: null, body: reply });
      return NextResponse.json({ handoff: true, reply });
    }

    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...(messages ?? []).map(m => ({ role: m.sender_type === "customer" ? "user" : "assistant", content: m.body }))
        ]
      })
    });
    if (!apiResponse.ok) {
      console.error("OpenAI Customer Care error:", await apiResponse.text());
      return NextResponse.json({ error: "The AI assistant is temporarily unavailable. Please try again or talk to a human agent." }, { status: 502 });
    }
    const result = await apiResponse.json();
    const reply = String(result.choices?.[0]?.message?.content ?? "").trim();
    if (!reply) return NextResponse.json({ error: "The AI could not prepare a reply. Please talk to a human agent." }, { status: 502 });
    const { error: saveError } = await db.from("support_messages").insert({
      conversation_id: conversationId, sender_type: "ai", sender_id: null, body: reply
    });
    if (saveError) return NextResponse.json({ error: "The reply could not be saved. Please try again." }, { status: 500 });
    return NextResponse.json({ reply, handoff: false });
  } catch (error) {
    console.error("Customer Care assistant error:", error);
    return NextResponse.json({ error: "Unable to process your message right now." }, { status: 500 });
  }
}
