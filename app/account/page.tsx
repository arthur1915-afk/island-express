"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, Store, UserRound, LogOut, ShoppingBag, Heart, Headset, Camera, MapPin, Pencil, Check, X, Bell } from "lucide-react";

type Profile = { id: string; full_name: string | null; role: "customer" | "seller" | "admin"; phone?: string | null; avatar_url?: string | null; bio?: string | null; island?: string | null; is_admin?: boolean };
type Shop = { id: string; name: string; slug: string; island: string | null; logo_url?: string | null };

export default function AccountPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
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
  const [shopIsland, setShopIsland] = useState("Mahé");
  const [editProfile, setEditProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [islandDraft, setIslandDraft] = useState("Mahé");
  const [accountEmail, setAccountEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shopLogoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") setMode("signup");
    if (params.get("mode") === "login") setMode("login");
  }, []);

  async function loadAccount(id: string) {
    setUserId(id);
    const { data: authData } = await supabase.auth.getUser();
    setAccountEmail(authData.user?.email || "");
    const { data, error } = await supabase.from("profiles").select("id,full_name,role,phone,avatar_url,bio,island,is_admin").eq("id", id).single();
    if (error) { setMessage("We couldn't load your profile. Please refresh the page."); return; }
    const p = data as Profile;
    setProfile(p); setNameDraft(p.full_name || ""); setPhoneDraft(p.phone || "");
    setBioDraft(p.bio || ""); setIslandDraft(p.island || "Mahé");
    const { data: shops } = await supabase.from("shops").select("id,name,slug,island,logo_url").eq("owner_id", id).limit(1);
    setShop((shops?.[0] as Shop) ?? null);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user) { setEmail(data.session.user.email || ""); loadAccount(data.session.user.id); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user) { setEmail(session.user.email || ""); loadAccount(session.user.id); }
      if (active && !session) { setUserId(null); setProfile(null); setShop(null); setAccountEmail(""); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin + "/account" } });
        if (error) throw error;
        if (data.session?.user) {
          await loadAccount(data.session.user.id);
          const next = new URLSearchParams(window.location.search).get("next");
          if (next?.startsWith("/") && !next.startsWith("//")) window.location.href = next;
        } else setMessage("Registration received. Check your email and confirm your address, then return here to log in.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.user) {
          await loadAccount(data.user.id);
          const next = new URLSearchParams(window.location.search).get("next");
          if (next?.startsWith("/") && !next.startsWith("//")) window.location.href = next;
        }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  async function sendPasswordReset() {
    const address = email.trim();
    if (!address) {
      setMessage("Enter your account email address first.");
      return;
    }
    setResetSending(true);
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: window.location.origin + "/account/reset-password",
    });
    if (error) setMessage(error.message);
    else setMessage("If an account exists for that email, a password reset link has been sent. Please check your inbox and spam folder.");
    setResetSending(false);
  }

  async function saveProfile() {
    if (!userId) return;
    setBusy(true); setMessage("");
    const updates = { full_name: nameDraft.trim(), phone: phoneDraft.trim() || null, bio: bioDraft.trim() || null, island: islandDraft };
    const { data, error } = await supabase.from("profiles").update(updates).eq("id", userId)
      .select("id,full_name,role,phone,avatar_url,bio,island,is_admin").maybeSingle();
    if (error) setMessage(error.message);
    else if (!data) setMessage("Your profile was not saved. Please run the profile permissions SQL in Supabase, then try again.");
    else {
      const saved = data as Profile;
      setProfile(saved);
      setNameDraft(saved.full_name || "");
      setPhoneDraft(saved.phone || "");
      setBioDraft(saved.bio || "");
      setIslandDraft(saved.island || "Mahé");
      setEditProfile(false);
      setMessage("Your profile has been saved.");
    }
    setBusy(false);
  }

  async function uploadAvatar(file?: File) {
    if (!file || !userId) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { setMessage("Please choose a JPG, PNG or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("Your profile picture must be 5 MB or smaller."); return; }
    setBusy(true); setMessage("");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = userId + "/avatar." + ext;
    const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setMessage(uploadError.message); setBusy(false); return; }
    const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
    const avatarUrl = data.publicUrl + "?v=" + Date.now();
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
    if (error) setMessage(error.message);
    else { setProfile(p => p ? { ...p, avatar_url: avatarUrl } : p); setMessage("Profile picture updated."); }
    setBusy(false);
  }

  async function removeAvatar() {
    if (!userId || !profile?.avatar_url) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) setMessage(error.message);
    else { setProfile(p => p ? { ...p, avatar_url: null } : p); setMessage("Profile picture removed."); }
    setBusy(false);
  }

  async function uploadShopLogo(file?: File) {
    if (!file || !userId || !shop) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { setMessage("Please choose a JPG, PNG or WebP shop logo."); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("Your shop logo must be 5 MB or smaller."); return; }
    setBusy(true); setMessage("");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = userId + "/shop-logo." + ext;
    const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setMessage("Could not upload shop logo: " + uploadError.message); setBusy(false); return; }
    const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
    const logoUrl = data.publicUrl + "?v=" + Date.now();
    const { data: saved, error } = await supabase.from("shops").update({ logo_url: logoUrl }).eq("id", shop.id).eq("owner_id", userId).select("id,name,slug,island,logo_url").single();
    if (error) setMessage("Logo uploaded but could not be saved to your shop: " + error.message);
    else { setShop(saved as Shop); setMessage("Shop profile picture updated."); }
    setBusy(false);
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
    const { data, error } = await supabase.from("shops").insert({ owner_id: userId, name: shopName.trim(), slug, description: shopDescription.trim(), island: shopIsland }).select("id,name,slug,island").single();
    if (error) setMessage(error.message);
    else { setShop(data as Shop); setMessage("Your shop has been created! You can now prepare your first product listing."); }
    setBusy(false);
  }

  async function signOut() { await supabase.auth.signOut(); setMessage("You have signed out."); }

  return <main className="account-page">
    <div className="account-top"><Link href="/" className="account-back"><ArrowLeft size={17}/> Back to Island Express</Link><span className="account-brand">island<span>express</span></span></div>
    <section className="account-card">
      {!userId ? <>
        <div className="account-icon"><UserRound size={25}/></div><div className="eyebrow">WELCOME TO THE ISLANDS</div>
        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p className="account-sub">Shop local, discover island businesses and manage your Island Express account.</p>
        <div className="auth-tabs"><button className={mode === "signup" ? "selected" : ""} onClick={() => {setMode("signup");setMessage("");}}>Create account</button><button className={mode === "login" ? "selected" : ""} onClick={() => {setMode("login");setMessage("");}}>Log in</button></div>
        <form onSubmit={submitAuth} className="account-form">
          {mode === "signup" && <label>Full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your full name"/></label>}
          <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          <label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
          <button className="primary account-submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}</button>
        </form>
        {mode === "login" && <button type="button" className="forgot-password-link" onClick={sendPasswordReset} disabled={resetSending}>{resetSending ? "Sending reset link…" : "Forgot password?"}</button>}
      </> : <>
        <div className="profile-page-heading"><div><div className="eyebrow">MY ISLAND EXPRESS</div><h1>My profile</h1><p>Manage your personal information and account activity.</p></div><span className="account-role">{profile?.role || "customer"}</span></div>
        <div className="profile-hero">
          <div className="profile-photo-wrap">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="Your profile" className="profile-photo"/> : <div className="profile-photo profile-photo-placeholder"><UserRound size={38}/></div>}
            <button className="profile-camera" type="button" onClick={()=>fileRef.current?.click()} disabled={busy} aria-label="Change profile picture"><Camera size={17}/></button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>uploadAvatar(e.target.files?.[0])}/>
          </div>
          <div className="profile-hero-copy"><h2>{profile?.full_name || "Island Express member"}</h2><p>{accountEmail}</p><span><MapPin size={13}/>{profile?.island || "Island not set"}</span></div>
          <div className="profile-hero-actions"><button className="profile-edit-button" onClick={()=>setEditProfile(v=>!v)}><Pencil size={15}/>{editProfile ? "Close editor" : "Edit profile"}</button>{profile?.avatar_url && <button className="profile-remove-photo" onClick={removeAvatar} disabled={busy}>Remove photo</button>}</div>
        </div>
        {editProfile ? <div className="profile-edit-panel">
          <div className="profile-panel-title"><h2>Personal information</h2><span>Only you can edit these details</span></div>
          <div className="profile-fields">
            <label>Full name<input value={nameDraft} onChange={e=>setNameDraft(e.target.value)} placeholder="Your full name"/></label>
            <label>Email address<input value={accountEmail} disabled/><small>Email is managed through your sign-in settings.</small></label>
            <label>Phone number<input value={phoneDraft} onChange={e=>setPhoneDraft(e.target.value)} placeholder="+248 ..."/></label>
            <label>Island<select value={islandDraft} onChange={e=>setIslandDraft(e.target.value)}><option>Mahé</option><option>Praslin</option><option>La Digue</option><option>Other</option></select></label>
            <label className="profile-bio-field">Bio<textarea maxLength={240} value={bioDraft} onChange={e=>setBioDraft(e.target.value)} placeholder="A little about yourself..."/></label>
          </div>
          <div className="profile-edit-actions"><button className="profile-cancel" onClick={()=>{setEditProfile(false);setNameDraft(profile?.full_name||"");setPhoneDraft(profile?.phone||"");setBioDraft(profile?.bio||"");setIslandDraft(profile?.island||"Mahé");}}><X size={15}/> Cancel</button><button className="primary" onClick={saveProfile} disabled={busy}><Check size={15}/>{busy ? "Saving…" : "Save changes"}</button></div>
        </div> : <div className="profile-about"><div className="profile-panel-title"><h2>About me</h2></div><p>{profile?.bio || "Add a short bio to tell the Island Express community a little about yourself."}</p><div className="profile-detail-row"><span>Phone</span><b>{profile?.phone || "Not added"}</b></div><div className="profile-detail-row"><span>Island</span><b>{profile?.island || "Not set"}</b></div></div>}
        <div className="profile-activity-heading">ACCOUNT ACTIVITY</div>
        <div className="profile-activity-grid">
          <Link href="/orders"><ShoppingBag/><b>My Orders</b><small>Purchases and delivery updates</small></Link>
          <Link href="/notifications"><Bell/><b>Notifications</b><small>Order confirmations and seller updates</small></Link>
          <Link href="/wishlist"><Heart/><b>My Favourites</b><small>Your saved products</small></Link>
          <Link href="/support"><Headset/><b>Customer Care</b><small>Get help from our support team</small></Link>
        </div>
        {profile?.role === "customer" && <div className="account-feature-card"><div className="account-feature-icon"><Store size={22}/></div><div><h2>Start selling on Island Express</h2><p>Open your own shop and reach customers across Seychelles. Product listings are reviewed before they go live.</p></div><button className="primary account-submit" disabled={busy} onClick={becomeSeller}>{busy ? "Please wait…" : "Become a seller"}</button></div>}
        {profile?.role === "seller" && !shop && <form onSubmit={createShop} className="account-form shop-form account-shop-form"><h2>Create your shop</h2><label>Shop name<input required value={shopName} onChange={e=>setShopName(e.target.value)} placeholder="e.g. Island Finds"/></label><label>About your shop<textarea value={shopDescription} onChange={e=>setShopDescription(e.target.value)} placeholder="Tell customers what you sell"/></label><label>Island<select value={shopIsland} onChange={e=>setShopIsland(e.target.value)}><option>Mahé</option><option>Praslin</option><option>La Digue</option><option>Other</option></select></label><button className="primary account-submit" disabled={busy}>{busy ? "Creating shop…" : "Create my shop"}</button></form>}
        {shop && <div className="account-shop-card"><div className="account-shop-card-top"><span className="account-shop-icon"><Store size={22}/></span><span className="account-shop-status">SHOP ACTIVE</span></div><div className="account-shop-logo-editor">{shop.logo_url ? <img src={shop.logo_url} alt={shop.name+" logo"}/> : <span className="account-shop-logo-placeholder"><Store size={27}/></span>}<div><b>Shop profile picture</b><small>Upload your shop logo or business photo (JPG, PNG or WebP, max 5 MB).</small><button type="button" className="profile-edit-button" onClick={()=>shopLogoRef.current?.click()} disabled={busy}>{busy ? "Uploading…" : shop.logo_url ? "Change shop picture" : "Upload shop picture"}</button><input ref={shopLogoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{uploadShopLogo(e.target.files?.[0]);e.currentTarget.value="";}}/></div></div><h2>{shop.name}</h2><p>Your shop is set up on {shop.island || "Seychelles"}.</p><small>island-express-one.vercel.app/shop/{shop.id}</small><Link className="primary account-shop-button" href="/seller">Open seller dashboard</Link></div>}
        <div className="account-footer-actions"><button className="logout-button" onClick={signOut}><LogOut size={16}/> Sign out</button></div>
      </>}
      {message && <div className="account-message" role="status">{message}</div>}
    </section>
  </main>;
}
