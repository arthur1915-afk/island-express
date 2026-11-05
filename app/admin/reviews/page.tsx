"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, RefreshCw, Star, Check, X } from "lucide-react";

type Review={id:string;product_id:string;customer_id:string;rating:number;title:string|null;body:string;created_at:string;products:{title:string}|null};

export default function AdminReviewsPage(){
 const router=useRouter();
 const [reviews,setReviews]=useState<Review[]>([]);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState("");
 async function load(){
  setLoading(true);setNotice("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){router.replace("/admin/login");return;}
  const {data:profile}=await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
  if(!profile?.is_admin){setNotice("Administrator access required.");setLoading(false);return;}
  const {data,error}=await supabase.from("product_reviews").select("id,product_id,customer_id,rating,title,body,created_at,products(title)").eq("status","pending").order("created_at",{ascending:true});
  if(error)setNotice(error.message);
  setReviews((data??[]) as unknown as Review[]);setLoading(false);
 }
 useEffect(()=>{load();},[]);
 async function moderate(id:string,status:"approved"|"rejected"){
  setBusy(id);setNotice("");
  const {error}=await supabase.from("product_reviews").update({status,updated_at:new Date().toISOString()}).eq("id",id);
  if(error)setNotice(error.message);
  else setReviews(old=>old.filter(r=>r.id!==id));
  setBusy(""); 
 }
 return <main className="admin-page">
  <header className="seller-dash-header"><Link href="/admin" className="account-back"><ArrowLeft size={16}/> Admin Centre</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
  <div className="admin-wrap">
   <div className="admin-heading"><div><div className="eyebrow">ISLAND EXPRESS · MODERATION</div><h1>Product reviews</h1><p>Approve customer reviews before they appear publicly.</p></div><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
   {notice&&<div className="account-message">{notice}</div>}
   {loading?<div className="admin-empty">Loading reviews…</div>:reviews.length===0?<div className="admin-empty"><Star size={34}/><b>No reviews awaiting moderation</b><span>New verified-buyer reviews will appear here.</span></div>:
    <div className="admin-list">{reviews.map(r=><article className="admin-item review-admin-item" key={r.id}>
     <div className="admin-info"><div className="admin-item-meta">{r.products?.title||"Product"} · Submitted {new Date(r.created_at).toLocaleString()}</div><div className="review-stars">{Array.from({length:5},(_,i)=><Star key={i} size={16} fill={i<r.rating?"currentColor":"none"}/>)}</div>{r.title&&<h2>{r.title}</h2>}<p>{r.body}</p><small>Customer ID: {r.customer_id.slice(0,8)}</small></div>
     <div className="admin-actions"><button className="approve" disabled={busy===r.id} onClick={()=>moderate(r.id,"approved")}><Check size={15}/> Approve</button><button className="reject" disabled={busy===r.id} onClick={()=>moderate(r.id,"rejected")}><X size={15}/> Reject</button></div>
    </article>)}</div>}
  </div>
 </main>;
}
