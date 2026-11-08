import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const dbConfig = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripe: process.env.STRIPE_SECRET_KEY,
  };

  let db: ReturnType<typeof createClient> | null = null;
  let reservedOrderId: string | null = null;

  try {
    if (!dbConfig.url || !dbConfig.anon || !dbConfig.service || !dbConfig.stripe) {
      return NextResponse.json({ error: "Payment service is not fully configured." }, { status: 503 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const authClient = createClient(dbConfig.url, dbConfig.anon);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });

    const body = await request.json();
    const orderId = body?.orderId;
    const voucherCode = typeof body?.voucherCode === "string" ? body.voucherCode.trim().toUpperCase() : "";
    if (typeof orderId !== "string") return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });

    db = createClient(dbConfig.url, dbConfig.service);
    const { data: orderData, error: orderError } = await db.from("orders")
      .select("id,customer_id,email,total_scr,payment_status,status,stripe_session_id")
      .eq("id", orderId).eq("customer_id", user.id).single();
    const order = orderData as any;

    if (orderError || !order || order.payment_status === "paid" || order.status !== "pending") {
      return NextResponse.json({ error: "This order cannot be paid. It may already be paid or cancelled." }, { status: 400 });
    }

    const { data: rowsData, error: rowsError } = await db.from("order_items")
      .select("product_id,variant_id,variant_label,quantity,product_title").eq("order_id", orderId);
    const rows = (rowsData || []) as any[];
    if (rowsError || !rows?.length) return NextResponse.json({ error: "This order has no items." }, { status: 400 });

    const productIds = rows.map((row) => row.product_id).filter(Boolean);
    const { data: productsData, error: productsError } = await db.from("products")
      .select("id,title,price_scr,status,shop_id").in("id", productIds);
    // The Supabase client is not generated with the database schema types in this project.
    // Cast the selected rows explicitly so TypeScript can type the product fields.
    const products = (productsData ?? []) as Array<{
      id: string;
      title: string;
      price_scr: number | string;
      status: string;
      shop_id: string;
    }>;

    if (productsError || !products.length || products.length !== new Set(productIds).size || products.some((p) => p.status !== "approved")) {
      return NextResponse.json({ error: "One or more products are no longer available. Please contact the seller." }, { status: 400 });
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantIds = rows.map((row) => row.variant_id).filter(Boolean);
    const { data: variantRows, error: variantError } = variantIds.length ? await db.from("product_variants").select("id,product_id,label,price_scr,stock_quantity,is_active").in("id", variantIds) : { data: [], error: null };
    if (variantError) return NextResponse.json({ error: "Could not verify product options. Please try again." }, { status: 500 });
    const variantMap = new Map((variantRows || []).map((v: any) => [v.id, v]));
    const itemRows = rows.map((row) => {
      const product = productMap.get(row.product_id);
      if (!product || !Number.isInteger(row.quantity) || row.quantity < 1) throw new Error("Invalid order item.");
      const variant = row.variant_id ? variantMap.get(row.variant_id) : null;
      if (row.variant_id && (!variant || variant.product_id !== product.id || !variant.is_active || variant.stock_quantity < row.quantity)) throw new Error("The selected option is unavailable or has insufficient stock. Please return to your cart.");
      const unitCents = Math.round(Number(variant?.price_scr ?? product.price_scr) * 100);
      if (!Number.isSafeInteger(unitCents) || unitCents < 1) throw new Error("A product has an invalid price.");
      return { product, variant, quantity: row.quantity, originalCents: unitCents * row.quantity, discountCents: 0 };
    });

    const subtotalCents = itemRows.reduce((sum, item) => sum + item.originalCents, 0);
    let voucher: { id: string; code: string } | null = null;
    let voucherDiscountCents = 0;\n    const taxCents = subtotalCents > 150000 ? Math.round(subtotalCents * 0.16) : 0;

    if (voucherCode) {
      const shopTotals = new Map<string, number>();
      for (const item of itemRows) {
        shopTotals.set(item.product.shop_id, (shopTotals.get(item.product.shop_id) || 0) + item.originalCents);
      }

      const { data: vouchersData, error: voucherError } = await db.from("shop_vouchers")
        .select("id,shop_id,code,discount_type,discount_value,minimum_spend_scr,starts_at,ends_at,max_redemptions,redemption_count")
        .ilike("code", voucherCode).eq("is_active", true);
      // Supabase is used without generated Database typings, so define the selected row shape.
      const vouchers = (vouchersData ?? []) as Array<{
        id: string;
        shop_id: string;
        code: string;
        discount_type: string;
        discount_value: number | string;
        minimum_spend_scr: number | string | null;
        starts_at: string | null;
        ends_at: string | null;
        max_redemptions: number | null;
        redemption_count: number | null;
      }>;

      if (voucherError || !vouchers.length) {
        return NextResponse.json({ error: "That voucher code was not found or is inactive." }, { status: 400 });
      }

      const now = Date.now();
      const candidate = vouchers.find((v) => {
        const shopSubtotal = shopTotals.get(v.shop_id) || 0;
        return shopTotals.has(v.shop_id) &&
          (!v.starts_at || now >= new Date(v.starts_at).getTime()) &&
          (!v.ends_at || now <= new Date(v.ends_at).getTime()) &&
          shopSubtotal >= Number(v.minimum_spend_scr || 0) &&
          (v.max_redemptions == null || Number(v.redemption_count) < Number(v.max_redemptions));
      });
      if (!candidate) return NextResponse.json({ error: "This voucher does not apply to products in your cart." }, { status: 400 });

      const eligibleSubtotalCents = shopTotals.get(candidate.shop_id) || 0;
      const rawDiscount = candidate.discount_type === "percentage"
        ? eligibleSubtotalCents * Number(candidate.discount_value) / 100
        : Number(candidate.discount_value) * 100;
      voucherDiscountCents = Math.min(eligibleSubtotalCents, Math.max(0, Math.round(rawDiscount)));

      const { data: reserved, error: reserveError } = await (db as any).rpc("reserve_shop_voucher", {
        p_voucher_id: candidate.id,
        p_shop_id: candidate.shop_id,
        p_subtotal: eligibleSubtotalCents / 100,
      });

      if (reserveError || !reserved) {
        return NextResponse.json({ error: reserveError?.message || "This voucher is no longer available." }, { status: 400 });
      }

      voucher = { id: candidate.id, code: candidate.code };
      let remainingDiscount = voucherDiscountCents;
      const eligibleItems = itemRows.filter((item) => item.product.shop_id === candidate.shop_id);
      const shares = eligibleItems.map((item) => {
        const exact = voucherDiscountCents * item.originalCents / eligibleSubtotalCents;
        const base = Math.floor(exact);
        return { item, base, fraction: exact - base };
      });
      for (const share of shares) {
        share.item.discountCents = share.base;
        remainingDiscount -= share.base;
      }
      shares.sort((a, b) => b.fraction - a.fraction);
      for (let i = 0; i < remainingDiscount; i++) shares[i % shares.length].item.discountCents++;

      const { error: saveVoucherError } = await (db as any).from("orders").update({
        voucher_id: voucher.id,
        voucher_code: voucher.code,
        discount_scr: voucherDiscountCents / 100,
      }).eq("id", order.id).eq("customer_id", user.id).eq("status", "pending");

      if (saveVoucherError) {
        await (db as any).from("shop_vouchers").update({ redemption_count: Math.max(0, Number(reserved.redemption_count) - 1) }).eq("id", candidate.id);
        return NextResponse.json({ error: "Could not save the voucher to your order. Please try again." }, { status: 500 });
      }
      reservedOrderId = order.id;
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = itemRows
      .map((item) => {
        const amount = item.originalCents - item.discountCents;
        if (amount <= 0) return null;
        return {
          price_data: {
            currency: "scr",
            product_data: { name: [item.product.title,item.variant?.label].filter(Boolean).join(" — ") + (item.quantity > 1 ? ` × ${item.quantity}` : "") },
            unit_amount: amount,
          },
          quantity: 1,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (taxCents > 0) {\n      lineItems.push({ price_data: { currency: "scr", product_data: { name: "Tax (16%)" }, unit_amount: taxCents }, quantity: 1 });\n    }\n\n    const totalCents = lineItems.reduce((sum, item) => sum + (item.price_data?.unit_amount || 0) * (item.quantity || 1), 0);
    if (totalCents < 100) {
      if (reservedOrderId) await (db as any).rpc("release_order_voucher", { p_order_id: reservedOrderId });
      return NextResponse.json({ error: "The discounted order total is below Stripe's minimum charge." }, { status: 400 });
    }

    const stripe = new Stripe(dbConfig.stripe);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        customer_email: order.email || user.email || undefined,
        client_reference_id: order.id,
        metadata: {
          order_id: order.id,
          customer_id: user.id,
          voucher_id: voucher?.id || "",
          voucher_code: voucher?.code || "",\n          tax_scr: (taxCents / 100).toFixed(2),
        },
        success_url: origin + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: origin + "/orders?payment=cancelled",
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      });
    } catch (stripeError) {
      if (reservedOrderId) await (db as any).rpc("release_order_voucher", { p_order_id: reservedOrderId });
      throw stripeError;
    }

    const { error: updateError } = await (db as any).from("orders").update({
      total_scr: totalCents / 100,
      subtotal_scr: subtotalCents / 100,
      discount_scr: voucherDiscountCents / 100,
      voucher_id: voucher?.id || null,
      voucher_code: voucher?.code || null,
      payment_method: "stripe",
      payment_status: "unpaid",
      status: "pending",
      stripe_session_id: session.id,
    }).eq("id", order.id).eq("customer_id", user.id).eq("status", "pending");

    if (updateError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => null);
      if (reservedOrderId) await (db as any).rpc("release_order_voucher", { p_order_id: reservedOrderId });
      return NextResponse.json({ error: "Could not finalise your order. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    if (db && reservedOrderId) {
      await (db as any).rpc("release_order_voucher", { p_order_id: reservedOrderId }).catch(() => null);
    }
    return NextResponse.json({ error: "Unable to start card payment. Please try again." }, { status: 500 });
  }
}
