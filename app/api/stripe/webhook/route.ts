import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !webhookSecret || !supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const payload = await request.text();
  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  const db = createClient(supabaseUrl, serviceKey);
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.metadata?.order_id) {
      await db.from("orders").update({
        payment_status: "paid",
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        status: "confirmed"
      }).eq("id", session.metadata.order_id).eq("stripe_session_id", session.id).eq("status", "pending").eq("payment_status", "unpaid");
    }
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.order_id) {
      const { data: expiredOrder } = await db.from("orders").select("id,voucher_id").eq("id", session.metadata.order_id).eq("stripe_session_id", session.id).eq("status", "pending").neq("payment_status", "paid").maybeSingle();\n      await db.from("orders").update({ payment_status: "failed" }).eq("id", session.metadata.order_id).eq("stripe_session_id", session.id).eq("status", "pending").neq("payment_status", "paid");\n      if (expiredOrder?.voucher_id) await db.rpc("release_order_voucher", { p_order_id: expiredOrder.id });
    }
  }
  return NextResponse.json({ received: true });
}
