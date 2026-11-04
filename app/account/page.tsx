"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, Store, UserRound, LogOut, ShoppingBag } from "lucide-react";

type Profile = { id: string; full_name: string | null; role: "customer" | "seller" | "admin"; phone?: string | null; is_admin?: boolean };
type Shop = { id: string; name: string; slug: string; island: string | null };

export default function AccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [island, setIsland] = useState("Mahé");

  async function loadAccount(id: string) {
    setUserId(id);
    const { data, error } = await supabase.from("profiles").select("id,full_name,role,phone,is_admin").eq("id", id).single();
    if (error) { setMessage("Your account was created, but we couldn't load the profile yet. Refresh this page in a moment."); return; }
    setProfile(data as Profile);
    const { data: shops } = await supabase.from("shops").select("id,name,slug,island").eq("owner_id", id).limit(1);
    setShop((shops?.[0] as Shop) ?? null);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user) loadAccount(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user) loadAccount(session.user.id);
      if (active && !session) { setUserId(null); setProfile(null); setShop(null); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin + "/account" }
        });
        if (error) throw error;
        if (data.session?.user) await loadAccount(data.session.user.id);
        else setMessage("Registration received. Check your email and confirm your address, then return here to log in.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.user) await loadAccount(data.user.id);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  async function becomeSeller() {
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("become_seller");
    if (error) setMessage(error.message);
    else if (userId) await loadAccount(userId);
    setBusy(false);
  }

  async function createShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!userId) return;
    setBusy(true); setMessage("");
    const slug = shopName.toLowerCase().trim().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, error } = await supabase.from("shops").insert({
      owner_id: userId, name: shopName.trim(), slug, description: shopDescription.trim(), island
    }).select("id,name,slug,island").single();
    if (error) setMessage(error.message);
    else { setShop(data as Shop); setMessage("Your shop has been created! You can now prepare your first product listing."); }
    setBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); setMessage("You have signed out."); }

  return <main className="account-page">
    <div className="account-top"><Link href="/" className="account-back"><ArrowLeft size={17}/> Back to Island Express</Link><span className="account-brand">island<span>express</span></span></div>
    <section className="account-card">
      {!userId ? <>
        <div className="account-icon"><UserRound size={25}/></div>
        <div className="eyebrow">WELCOME TO THE ISLANDS</div>
        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="account-sub">Shop local, discover island businesses and manage your Island Express account.</p>
        <div className="auth-tabs"><button className={mode === "signup" ? "selected" : ""} onClick={() => {setMode("signup");setMessage("");}}>Create account</button><button className={mode === "login" ? "selected" : ""} onClick={() => {setMode("login");setMessage("");}}>Log in</button></div>
        <form onSubmit={submitAuth} className="account-form">
          {mode === "signup" && <label>Full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your full name"/></label>}
          <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          <label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
          <button className="primary account-submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}</button>
        </form>
      </> : <>
        <div className="account-overview">
          <div className="account-overview-heading">
            <div className="account-avatar"><UserRound size={27}/></div>
            <div>
              <div className="eyebrow">ACCOUNT OVERVIEW</div>
              <h1>Welcome back{profile?.full_name ? ", " + profile.full_name.split(" ")[0] : ""}</h1>
              <p className="account-sub">Manage your Island Express account and activity.</p>
            </div>
          </div>
          <div className="account-member-card">
            <div className="account-member-details">
              <span className="account-member-name">{profile?.full_name || "Island Express member"}</span>
              <span>{email || "Signed-in account"}</span>
            </div>
            <span className="account-role">{profile?.role || "customer"}</span>
          </div>
          <div className="account-section-label">YOUR ACTIVITY</div>
          <Link className="account-action-card" href="/orders">
            <span className="account-action-icon"><ShoppingBag size={20}/></span>
            <span><b>My Orders</b><small>View purchases, order status and shipping updates</small></span>
            <span className="account-action-arrow">›</span>
          </Link>
          {profile?.role === "customer" && <div className="account-feature-card">
            <div className="account-feature-icon"><Store size={22}/></div>
            <div><h2>Start selling on Island Express</h2><p>Open your own shop and reach customers across Seychelles. Product listings are reviewed before they go live.</p></div>
            <button className="primary account-submit" disabled={busy} onClick={becomeSeller}>{busy ? "Please wait…" : "Become a seller"}</button>
          </div>}
          {profile?.role === "seller" && !shop && <form onSubmit={createShop} className="account-form shop-form account-shop-form">
            <h2>Create your shop</h2><label>Shop name<input required value={shopName} onChange={e=>setShopName(e.target.value)} placeholder="e.g. Island Finds"/></label>
            <label>About your shop<textarea value={shopDescription} onChange={e=>setShopDescription(e.target.value)} placeholder="Tell customers what you sell"/></label>
            <label>Island<select value={island} onChange={e=>setIsland(e.target.value)}><option>Mahé</option><option>Praslin</option><option>La Digue</option><option>Other</option></select></label>
            <button className="primary account-submit" disabled={busy}>{busy ? "Creating shop…" : "Create my shop"}</button>
          </form>}
          {shop && <div className="account-shop-card">
            <div className="account-shop-card-top"><span className="account-shop-icon"><Store size={22}/></span><span className="account-shop-status">SHOP ACTIVE</span></div>
            <h2>{shop.name}</h2><p>Your shop is set up on {shop.island || "Seychelles"}.</p>
            <small>island-express-one.vercel.app/shops/{shop.slug}</small>
            <Link className="primary account-shop-button" href="/seller">Open seller dashboard</Link>
          </div>}
          <div className="account-footer-actions"><button className="logout-button" onClick={signOut}><LogOut size={16}/> Sign out</button></div>
        </div>
      </>}
      {message && <div className="account-message" role="status">{message}</div>}
    </section>
  </main>;
}
