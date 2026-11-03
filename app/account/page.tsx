"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, Store, UserRound, LogOut } from "lucide-react";

type Profile = { id: string; full_name: string | null; role: "customer" | "seller" | "admin"; phone?: string | null };
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
    const { data, error } = await supabase.from("profiles").select("id,full_name,role,phone").eq("id", id).single();
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
        <div className="account-icon"><UserRound size={25}/></div>
        <div className="eyebrow">YOUR ISLAND EXPRESS ACCOUNT</div>
        <h1>Hello{profile?.full_name ? ", " + profile.full_name.split(" ")[0] : ""}!</h1>
        <p className="account-sub">{profile?.role === "seller" ? "Your seller account is ready." : "You're signed in as a customer."}</p>
        <div className="profile-summary"><span>{profile?.full_name || "Island Express member"}</span><small>{email || "Signed-in account"} · {profile?.role || "customer"}</small></div>
        {profile?.role === "customer" && <div className="seller-panel"><Store size={25}/><h2>Start selling on Island Express</h2><p>Register as a seller and create your own shop. Product listings will be reviewed before they appear publicly.</p><button className="primary account-submit" disabled={busy} onClick={becomeSeller}>{busy ? "Please wait…" : "Become a seller"}</button></div>}
        {profile?.role === "seller" && !shop && <form onSubmit={createShop} className="account-form shop-form"><h2>Create your shop</h2><label>Shop name<input required value={shopName} onChange={e=>setShopName(e.target.value)} placeholder="e.g. Island Finds"/></label><label>About your shop<textarea value={shopDescription} onChange={e=>setShopDescription(e.target.value)} placeholder="Tell customers what you sell"/></label><label>Island<select value={island} onChange={e=>setIsland(e.target.value)}><option>Mahé</option><option>Praslin</option><option>La Digue</option><option>Other</option></select></label><button className="primary account-submit" disabled={busy}>{busy ? "Creating shop…" : "Create my shop"}</button></form>}
        {shop && <div className="shop-success"><Store size={22}/><h2>{shop.name}</h2><p>Your shop is set up on {shop.island || "Seychelles"}.</p><small>Shop address: /shops/{shop.slug}</small><p className="account-sub">Your seller centre is ready to manage product listings.</p><Link className="primary account-submit" href="/seller">Open seller dashboard</Link></div>}
        <button className="logout-button" onClick={signOut}><LogOut size={16}/> Sign out</button>
      </>}
      {message && <div className="account-message" role="status">{message}</div>}
    </section>
  </main>;
}
