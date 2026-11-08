import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("Account deletion is not configured.");
  return {
    auth: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export async function POST(request: Request) {
  try {
    const { auth, admin } = clients();
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
    if (!bearer) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { data: { user }, error: authError } = await auth.auth.getUser(bearer);
    if (authError || !user?.email) return NextResponse.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });

    const body = await request.json();
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 160) : "";
    const details = typeof body?.details === "string" ? body.details.trim().slice(0, 1000) : "";
    if (!reason) return NextResponse.json({ error: "Please select a reason for deleting your account." }, { status: 400 });
    if (!user.email_confirmed_at) return NextResponse.json({ error: "Please verify your email address before requesting account deletion." }, { status: 400 });

    const { data: profile, error: profileError } = await admin.from("profiles").select("role,is_admin").eq("id", user.id).single();
    if (profileError || !profile || profile.is_admin || !["customer", "seller"].includes(profile.role)) {
      return NextResponse.json({ error: "Only buyer and seller accounts can use this option. Contact Customer Care for administrator account requests." }, { status: 403 });
    }

    await admin.from("account_deletion_requests").update({ status: "expired", token_hash: null })
      .eq("user_id", user.id).eq("status", "pending").lt("expires_at", new Date().toISOString());

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("account_deletion_requests").insert({
      user_id: user.id, email: user.email, account_role: profile.role, reason, details: details || null,
      token_hash: tokenHash, expires_at: expiresAt,
    });
    if (insertError) {
      if (insertError.code === "23505") return NextResponse.json({ error: "A deletion confirmation email is already pending. Please check your inbox or wait for it to expire." }, { status: 409 });
      throw insertError;
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { error: emailError } = await auth.auth.signInWithOtp({
      email: user.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: origin + "/account/delete-confirm?token=" + token,
      },
    });
    if (emailError) {
      await admin.from("account_deletion_requests").update({ status: "cancelled", token_hash: null })
        .eq("user_id", user.id).eq("token_hash", tokenHash);
      return NextResponse.json({ error: "We couldn't send the confirmation email. Please try again later." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion request error:", error);
    return NextResponse.json({ error: "Unable to request account deletion right now. Please try again later." }, { status: 500 });
  }
}
