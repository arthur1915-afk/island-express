import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!supabaseUrl || !serviceKey || !anonKey || !token) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }

    const auth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Your session is invalid." }, { status: 401 });

    const { code, items } = await request.json();
    if (typeof code !== "string" || !code.trim() || !Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: "Enter a voucher code and add items to your cart." }, { status: 400 });
    }

    const cleanItems = items.map((item: any) => ({
      id: typeof item?.id === "string" ? item.id : "",
      variantId: typeof item?.variantId === "string" ? item.variantId : null,
      quantity: Number(item?.quantity),
    }));
    if (cleanItems.some((item: any) => !item.id || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return NextResponse.json({ error: "Your cart contains an invalid item. Please refresh and try again." }, { status: 400 });
    }

    const db = createClient(supabaseUrl, serviceKey);
    const productIds = [...new Set(cleanItems.map((item: any) => item.id))];
    const { data: products, error: productsError } = await db
      .from("products").select("id,price_scr,shop_id,shops(name)")
      .in("id", productIds).eq("status", "approved");
    if (productsError || !products || products.length !== productIds.length) {
      return NextResponse.json({ error: "Some cart items are no longer available." }, { status: 400 });
    }

    const variantIds = [...new Set(cleanItems.map((item: any) => item.variantId).filter(Boolean))];
    const { data: variants, error: variantsError } = variantIds.length
      ? await db.from("product_variants").select("id,product_id,price_scr,is_active").in("id", variantIds)
      : { data: [], error: null };
    if (variantsError) return NextResponse.json({ error: "Could not verify product variations. Please try again." }, { status: 500 });

    const productMap = new Map(products.map((product: any) => [product.id, product]));
    const variantMap = new Map((variants || []).map((variant: any) => [variant.id, variant]));
    const shopTotals = new Map<string, { subtotal: number; name: string }>();

    for (const item of cleanItems) {
      const product: any = productMap.get(item.id);
      const variant: any = item.variantId ? variantMap.get(item.variantId) : null;
      if (item.variantId && (!variant || variant.product_id !== product.id || !variant.is_active)) {
        return NextResponse.json({ error: "A selected product variation is no longer available." }, { status: 400 });
      }
      const price = Number(variant?.price_scr ?? product.price_scr);
      const group = shopTotals.get(product.shop_id) || { subtotal: 0, name: product.shops?.name || "Seller" };
      group.subtotal += price * item.quantity;
      shopTotals.set(product.shop_id, group);
    }

    const { data: vouchers, error: voucherError } = await db.from("shop_vouchers")
      .select("id,shop_id,code,title,discount_type,discount_value,minimum_spend_scr,starts_at,ends_at,max_redemptions,redemption_count,is_active,applies_to_all_products")
      .ilike("code", code.trim()).eq("is_active", true);
    if (voucherError || !vouchers?.length) {
      return NextResponse.json({ error: "That voucher code was not found or is inactive." }, { status: 400 });
    }

    const {data:targetRows,error:targetError}=await db.from("shop_voucher_products").select("voucher_id,product_id").in("voucher_id",vouchers.map((voucher:any)=>voucher.id));
    if(targetError) return NextResponse.json({error:"Voucher product rules could not be checked. Please contact the seller."},{status:500});
    const targeted = new Map<string,Set<string>>();
    for(const row of targetRows??[]){const set=targeted.get(row.voucher_id)||new Set<string>();set.add(row.product_id);targeted.set(row.voucher_id,set);}
    const now = Date.now();
    const match: any = vouchers.find((voucher: any) => {
      const eligibleLines=cleanItems.filter((item:any)=>productMap.get(item.id)?.shop_id===voucher.shop_id&&(voucher.applies_to_all_products!==false||(targeted.get(voucher.id)?.has(item.id)??false)));
      const eligibleSubtotal=eligibleLines.reduce((sum:number,item:any)=>{const product:any=productMap.get(item.id);const variant:any=item.variantId?variantMap.get(item.variantId):null;return sum+Number(variant?.price_scr??product.price_scr)*item.quantity;},0);
      return eligibleSubtotal>0 &&
        (!voucher.starts_at || now >= new Date(voucher.starts_at).getTime()) &&
        (!voucher.ends_at || now <= new Date(voucher.ends_at).getTime()) &&
        eligibleSubtotal >= Number(voucher.minimum_spend_scr || 0) &&
        (voucher.max_redemptions == null || Number(voucher.redemption_count) < Number(voucher.max_redemptions));
    });
    if (!match) {
      return NextResponse.json({ error: "This voucher is expired, has reached its limit, does not apply to your cart, or its minimum spend is not met." }, { status: 400 });
    }

    const eligible = cleanItems.filter((item:any)=>productMap.get(item.id)?.shop_id===match.shop_id&&(match.applies_to_all_products!==false||(targeted.get(match.id)?.has(item.id)??false))).reduce((sum:number,item:any)=>{const product:any=productMap.get(item.id);const variant:any=item.variantId?variantMap.get(item.variantId):null;return sum+Number(variant?.price_scr??product.price_scr)*item.quantity;},0);
    const discount = Math.min(eligible, match.discount_type === "percentage"
      ? eligible * Number(match.discount_value) / 100
      : Number(match.discount_value));
    return NextResponse.json({
      valid: true, code: match.code, title: match.title, shop: shopTotals.get(match.shop_id)?.name || "Seller",
      discount: Number(discount.toFixed(2)), subtotal: Number(eligible.toFixed(2)),
    });
  } catch {
    return NextResponse.json({ error: "Could not validate this voucher." }, { status: 500 });
  }
}
