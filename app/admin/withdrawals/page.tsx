"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, RefreshCw, Wallet, CheckCircle2, XCircle } from "lucide-react";

type RequestRow = { id:string; seller_id:string; amount_scr:number; status:string; requested_at:string; processed_at:string|null; admin_note:string|null };
type Profile = { id:string; full_name:string|null; phone:string|null };
type Shop = { owner_id:string; name:string };

export default function AdminWithdrawalsPage(){
 const router=useRouter();
 const [rows,setRows]=useState<RequestRow[]>([]);
 const [profiles,setProfiles]=useState<Record<string,Profile>>({});
 const [shops,setShops]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);
 const [authorized,setAuthorized]=useState(false);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");

 async function load(){
  setLoading(true);setMessage("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){router.replace("/admin/login");return;}
  const {data:assurance}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance?.currentLevel!=="aal2"){router.replace("/admin/login");return;}
  const {data:admin}=await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
  if(!admin?.is_admin){setAuthorized(false);setLoading(false);return;}
  setAuthorized(true);
  const {data,error}=await supabase.from("seller_withdrawal_requests").select("id,seller_id,amount_scr,status,requested_at,processed_at,admin_note").order("requested_at",{ascending:false});
  if(error){setMessage(error.message);setRows([]);setLoading(false);return;}
  const requests=(data??[]) as RequestRow[];setRows(requests);
  const ids=[...new Set(requests.map(x=>x.seller_id))];
  if(ids.length){
   const [p,s]=await Promise.all([
    supabase.from("profiles").select("id,full_name,phone").in("id",ids),
    supabase.from("shops").select("owner_id,name").in("owner_id",ids)
   ]);
   const pm:Record<string,Profile>={};(p.data??[]).forEach((x:any)=>pm[x.id]=x);setProfiles(pm);
   const sm:Record<string,string>={};(s.data??[]).forEach((x:any)=>sm[x.owner_id]=x.name);setShops(sm);
  }
  setLoading(false);
 }
 useEffect(()=>{load();},[]);

 async function process(row:RequestRow,decision:"paid"|"rejected"){
  const note=window.prompt(decision==="paid"?"Optional payout reference or admin note:":"Reason for rejecting this withdrawal:");
  if(note===null)return;
  if(decision==="rejected"&&!note.trim()){setMessage("Please enter a reason when rejecting a request.");return;}
  if(decision==="paid"&&!window.confirm("Confirm you have manually paid SCR "+Number(row.amount_scr).toFixed(2)+" to this seller?"))return;
  setBusy(row.id);setMessage("");
  const {error}=await supabase.rpc("admin_process_withdrawal",{target_request_id:row.id,decision,note:note.trim()||null});
  if(error)setMessage(error.message);else setMessage(decision==="paid"?"Withdrawal marked as paid.":"Withdrawal rejected and seller balance restored.");
  setBusy("");await load();
 }

 if(loading)return <main className="account-page"><section className="account-card">Loading withdrawal requests…</section></main>;
 if(!authorized)return <main className="account-page"><section className="account-card"><h1>Admin access required</h1><Link href="/admin/login" className="primary">Admin login</Link></section></main>;
 return <main className="admin-page">
  <header className="seller-dash-header"><Link href="/admin" className="account-back"><ArrowLeft size={16}/> Admin Centre</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
  <div className="admin-wrap">
   <div className="admin-heading"><div><div className="eyebrow">ISLAND EXPRESS · PAYOUTS</div><h1>Seller withdrawals</h1><p>Review withdrawal requests and record manual seller payouts.</p></div><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
   {message&&<div className="account-message">{message}</div>}
   <div className="admin-stats"><Wallet size={20}/><b>{rows.filter(r=>r.status==="pending"||r.status==="processing").length}</b><span>Requests awaiting action</span></div>
   {!rows.length?<div className="admin-empty"><Wallet size={36}/><b>No withdrawal requests</b><span>New seller requests will appear here.</span></div>:
    <div className="admin-list">{rows.map(row=>{const seller=profiles[row.seller_id];return <article className="admin-item withdrawal-admin-item" key={row.id}>
      <div className="admin-info"><div className="admin-item-meta">REQUESTED {new Date(row.requested_at).toLocaleString()}</div><h2>SCR {Number(row.amount_scr).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</h2><p><b>{shops[row.seller_id]||"Seller shop"}</b> · {seller?.full_name||"Seller"}{seller?.phone?" · "+seller.phone:""}</p><small>Request ID: {row.id.slice(0,8).toUpperCase()}</small><small>Status: {row.status.replace("_"," ")}</small>{row.admin_note&&<small>Admin note: {row.admin_note}</small>}</div>
      {(row.status==="pending"||row.status==="processing")&&<div className="admin-actions"><button className="approve" disabled={busy===row.id} onClick={()=>process(row,"paid")}><CheckCircle2 size={15}/> Mark paid</button><button className="reject" disabled={busy===row.id} onClick={()=>process(row,"rejected")}><XCircle size={15}/> Reject</button></div>}
    </article>})}</div>}
  </div>
 </main>;
}
