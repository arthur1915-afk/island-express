import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!accessToken) return NextResponse.json({ error: "Please sign in as an administrator first." }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Admin invitations are not configured on the server." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller, error: callerError } = await adminClient.from("profiles").select("is_admin").eq("id", user.id).single();
    if (callerError || !caller?.is_admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const redirectTo = new URL("/admin/set-password", request.url).toString();
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo });
    let targetUser = inviteData.user;
    let alreadyRegistered = false;

    if (inviteError) {
      const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw inviteError;
      targetUser = usersData.users.find((candidate) => candidate.email?.toLowerCase() === email) || null;
      if (!targetUser) throw inviteError;
      alreadyRegistered = true;
    }

    if (!targetUser) throw new Error("Supabase did not return the invited account.");
    const { error: profileError } = await adminClient.from("profiles").update({ is_admin: true }).eq("id", targetUser.id);
    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      message: alreadyRegistered
        ? email + " already has an account. Administrator access has been granted; they can sign in with their existing password."
        : "Invitation sent to " + email + ". They can use the email link to set a password and then sign in."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send the administrator invitation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
