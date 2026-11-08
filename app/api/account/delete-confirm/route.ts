import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Account deletion is not configured." }, { status: 503 });

  try {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
    if (!bearer) return NextResponse.json({ error: "Please open the confirmation link and sign in again if asked." }, { status: 401 });
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await auth.auth.getUser(bearer);
    if (authError || !user) return NextResponse.json({ error: "The email confirmation session is invalid. Please request a new link." }, { status: 401 });

    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token : "";
    if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "The confirmation link is invalid." }, { status: 400 });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: deletion, error: requestError } = await admin.from("account_deletion_requests")
      .select("id,user_id,expires_at,status,token_hash").eq("user_id", user.id).eq("token_hash", tokenHash).eq("status", "pending").maybeSingle();
    if (requestError || !deletion) return NextResponse.json({ error: "This confirmation link is invalid or has already been used. Please request a new one." }, { status: 400 });
    if (new Date(deletion.expires_at).getTime() < Date.now()) {
      await admin.from("account_deletion_requests").update({ status: "expired", token_hash: null }).eq("id", deletion.id);
      return NextResponse.json({ error: "This confirmation link has expired. Please request a new one." }, { status: 410 });
    }

    // Preserve transaction and compliance records while removing identifying
    // customer details, disabling storefronts, and permanently blocking sign-in.
    const anonymisedEmail = "deleted+" + user.id + "@account-deleted.invalid";
    const { error: orderError } = await admin.from("orders").update({
      customer_name: "Deleted account", phone: "", email: null, delivery_address: "Deleted",
      delivery_notes: null,
    }).eq("customer_id", user.id);
    if (orderError) throw orderError;

    const { data: ownedShops, error: shopsError } = await admin.from("shops").select("id").eq("owner_id", user.id);
    if (shopsError) throw shopsError;
    const shopIds = (ownedShops || []).map((shop: {id:string}) => shop.id);
    if (shopIds.length) {
      const { error: productError } = await admin.from("products").update({ is_archived: true }).in("shop_id", shopIds);
      if (productError) throw productError;
      const { error: deactivateError } = await admin.from("shops").update({ is_active: false }).in("id", shopIds);
      if (deactivateError) throw deactivateError;
    }

    const { error: profileError } = await admin.from("profiles").update({
      full_name: "Deleted account", phone: null, avatar_url: null, bio: null, island: null,
    }).eq("id", user.id);
    if (profileError) throw profileError;

    const { error: authDeleteError } = await admin.auth.admin.updateUserById(user.id, {
      email: anonymisedEmail,
      ban_duration: "876000h",
      user_metadata: {},
    });
    if (authDeleteError) throw authDeleteError;

    const { error: completeError } = await admin.from("account_deletion_requests").update({
      status: "completed", token_hash: null, completed_at: new Date().toISOString(),
    }).eq("id", deletion.id);
    if (completeError) throw completeError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion confirmation error:", error);
    return NextResponse.json({ error: "We could not complete account deletion. Please contact Customer Care for assistance." }, { status: 500 });
  }
}
