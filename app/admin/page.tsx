"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, ShieldCheck, Check, X, Ban, RefreshCw, Package } from "lucide-react";

type Listing = {
  id: string; title: string; description: string | null; category: string;
  price_scr: number; stock_quantity: number; image_urls: string[]; created_at: string;
  shop_id: string; shops: { name: string; island: string | null } | null;
};

export default function AdminPage() {
  const router = useRouter();
  const [items,setItems] = useState<Listing[]>([]);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState("");
  const [busyId,setBusyId] = useState("");
  const [authorized,setAuthorized] = useState(false);

  async function load() {
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    if(!user){router.replace("/account");return;}
    const {data:profile} = await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
    if(!profile?.is_admin){setAuthorized(false);setLoading(false);return;}
    setAuthorized(true);
    const {data,error} = await supabase.from("products")
      .select("id,title,description,category,price_scr,stock_quantity,image_urls,created_at,shop_id,shops(name,island)")
      .eq("status","pending_review").order("created_at",{ascending:true});
    if(error)setMessage(error.message);
    setItems((data??[]) as unknown as Listing[]);
    setLoading(false);
  }

  useEffect(()=>{load();},[]);

  async function decide(item:Listing,status:"approved"|"rejected"|"blocked") {
    setBusyId(item.id);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Please sign in again.");setBusyId("");return;}
    const outcome = status === "approved" ? "approved" : status === "blocked" ? "blocked" : "rejected";
    const explanation = status === "approved" ? "Approved by Island Express administrator." : status === "blocked" ? "Blocked by Island Express administrator." : "Rejected by Island Express administrator.";
    const {error:updateError}=await supabase.from("products").update({status}).eq("id",item.id);
    if(updateError){setMessage(updateError.message);setBusyId("");return;}
    const {error:logError}=await supabase.from("product_moderation").insert({
      product_id:item.id,outcome,explanation,reviewed_by:user.id,reviewed_at:new Date().toISOString(),model_name:"human-admin-review"
    });
    if(logError)setMessage("Decision saved, but moderation log could not be written: "+logError.message);
    setItems(old=>old.filter(p=>p.id!==item.id));
    setBusyId("");
  }

  if(loading)return <main className="account-page"><section className="account-card">Loading Admin Centre…</section></main>;
  if(!authorized)return <main className="account-page"><section className="account-card"><ShieldCheck size={32}/><h1>Admin access required</h1><p className="account-sub">This account does not have administrator permissions.</p><Link href="/" className="primary account-submit">Return to marketplace</Link></section></main>;

  return <main className="admin-page">
    <header className="seller-dash-header"><Link href="/" className="account-back"><ArrowLeft size={16}/> Marketplace</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
    <div className="admin-wrap">
      <div className="admin-heading"><div><div className="eyebrow">ISLAND EXPRESS · ADMINISTRATION</div><h1>Product moderation</h1><p>Review listings before they become visible to shoppers.</p></div><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
      <div className="admin-stats"><ShieldCheck size={20}/><b>{items.length}</b><span>Listings awaiting review</span></div>
      {message&&<div className="account-message">{message}</div>}
      {items.length===0?<div className="admin-empty"><Package size={36}/><b>You're all caught up</b><span>New seller submissions will appear here.</span></div>:
        <div className="admin-list">{items.map(item=><article className="admin-item" key={item.id}>
          <div className="admin-image">{item.image_urls?.[0]?<img src={item.image_urls[0]} alt=""/>:<Package size={28}/>}</div>
          <div className="admin-info"><div className="admin-item-meta">{item.category} · {item.shops?.island||"Seychelles"} · {item.shops?.name||"Seller shop"}</div><h2>{item.title}</h2><p>{item.description||"No description provided."}</p><b>SCR {Number(item.price_scr).toLocaleString()} · Stock {item.stock_quantity}</b><small>Submitted {new Date(item.created_at).toLocaleString()}</small></div>
          <div className="admin-actions"><button disabled={busyId===item.id} className="approve" onClick={()=>decide(item,"approved")}><Check size={15}/> Approve</button><button disabled={busyId===item.id} className="reject" onClick={()=>decide(item,"rejected")}><X size={15}/> Reject</button><button disabled={busyId===item.id} className="block" onClick={()=>decide(item,"blocked")}><Ban size={15}/> Block</button></div>
        </article>)}</div>}
    </div>
  </main>;
}
