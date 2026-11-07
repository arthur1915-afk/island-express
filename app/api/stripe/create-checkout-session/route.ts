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
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });

    const body = await request.json();
    const orderId = body?.orderId;
    const voucherCode = typeof body?.voucherCode === "string" ? body.voucherCode.trim().toUpperCase() : null;
    if (typeof orderId !== "string") return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });

    const db = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await db.from("orders").select("id,customer_id,email,total_scr,payment_status,status,stripe_session_id").eq("id", orderId).eq("customer_id", user.id).single();
    if (orderError || !order || order.payment_status === "paid" || order.status !== "pending") return NextResponse.json({ error: "This order cannot be paid. It may already be paid or cancelled." }, { status: 400 });

    const { data: rows, error: rowsError } = await db.from("order_items").select("product_id,quantity,product_title").eq("order_id", orderId);
    if (rowsError || !rows?.length) return NextResponse.json({ error: "This order has no items." }, { status: 400 });
    const productIds = rows.map((row) => row.product_id).filter(Boolean);
    const { data: products, error: productsError } = await db.from("products").select("id,title,price_scr,status,shop_id").in("id", productIds);
    if (productsError || !products || products.length !== rows.length || products.some((p) => p.status !== "approved")) {
      return NextResponse.json({ error: "One or more products are no longer available. Please contact the seller." }, { status: 400 });
    }
    const productMap = new Map(products.map((p) => [p.id, p]));
    const lineItems = rows.map((row) => {
      const product = productMap.get(row.product_id);
      if (!product || !Number.isInteger(row.quantity) || row.quantity < 1) throw new Error("Invalid order item.");
      return { price_data: { currency: "scr", product_data: { name: product.title }, unit_amount: Math.round(Number(product.price_scr) * 100) }, quantity: row.quantity };
    });
    const total = lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0);
    if (total < 100) return NextResponse.json({ error: "The order total is below Stripe's minimum charge." }, { status: 400 });

    const stripe = new Stripe(secret);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: order.email || user.email || undefined,
      client_reference_id: order.id,
      metadata: { order_id: order.id, customer_id: user.id, voucher_id: voucher?.id || "", voucher_code: voucher?.code || "" },
      success_url: origin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/orders?payment=cancelled",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });
    await db.from("orders").update({ total_scr: total / 100, subtotal_scr: Number(order.total_scr), discount_scr: voucherDiscount, voucher_id: voucher?.id || null, voucher_code: voucher?.code || null, payment_method: "stripe", payment_status: "unpaid", status: "pending", stripe_session_id: session.id }).eq("id", order.id).eq("customer_id", user.id).eq("status", "pending");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: "Unable to start card payment. Please try again." }, { status: 500 });
  }
}
