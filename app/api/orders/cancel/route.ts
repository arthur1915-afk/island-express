import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || !supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Payment service is not fully configured." }, { status: 503 });
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
    if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const auth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const { orderId } = await request.json();
    if (typeof orderId !== "string") return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });
    const db = createClient(supabaseUrl, serviceKey);
    const { data: order, error } = await db.from("orders")
      .select("id,customer_id,payment_status,status,stripe_session_id")
      .eq("id", orderId).eq("customer_id", user.id).single();
    if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.payment_status === "paid" || order.status !== "pending") {
      return NextResponse.json({ error: "Only unpaid pending orders can be cancelled." }, { status: 400 });
    }

    if (order.stripe_session_id) {
      const stripe = new Stripe(secret);
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
        if (session.payment_status === "paid") {
          return NextResponse.json({ error: "This payment has already completed. Refresh your orders." }, { status: 409 });
        }
      } catch (stripeError) {
        console.error("Stripe session check during cancellation:", stripeError);
        return NextResponse.json({ error: "We could not verify the payment status with Stripe. Please try again." }, { status: 502 });
      }
    }

    const { data: updated, error: updateError } = await db.from("orders")
      .update({ status: "cancelled", payment_status: "failed" })
      .eq("id", orderId).eq("customer_id", user.id).eq("status", "pending").neq("payment_status", "paid")
      .select("id").maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "The order could not be cancelled. Please refresh and check its latest status." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel order error:", error);
    return NextResponse.json({ error: "Unable to cancel this order right now." }, { status: 500 });
  }
}
