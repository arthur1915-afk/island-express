"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, ShieldCheck, Check, X, Ban, RefreshCw, Package, Headset, Star, Wallet, UserPlus, Megaphone, UserMinus, Users, Bell } from "lucide-react";

type AdminAccount = { user_id: string; email: string };
type CancellationRequest = { request_id: string; order_id: string; shop_id: string; seller_id: string; status: string; seller_note: string | null; requested_at: string; shop_name: string; customer_name: string; customer_id: string; total_scr: number };
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
  const [admins,setAdmins] = useState<AdminAccount[]>([]);
  const [adminEmail,setAdminEmail] = useState("");
  const [adminBusy,setAdminBusy] = useState(false);
  const [cancellationRequests,setCancellationRequests] = useState<CancellationRequest[]>([]);
  const [unreadNotifications,setUnreadNotifications] = useState(0);

  async function load() {
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    if(!user){router.replace("/admin/login");return;}
    const {data:profile} = await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
    if(!profile?.is_admin){setAuthorized(false);setLoading(false);return;}
    setAuthorized(true);
    const {count:unreadCount}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",user.id).is("read_at",null);
    setUnreadNotifications(unreadCount??0);
    const {data:adminRows,error:adminError}=await supabase.rpc("admin_list_accounts");
    if(adminError)setMessage("Admin accounts could not be loaded: "+adminError.message);
    setAdmins((adminRows??[]) as AdminAccount[]);
    const {data,error} = await supabase.from("products")
      .select("id,title,description,category,price_scr,stock_quantity,image_urls,created_at,shop_id,shops(name,island)")
      .eq("status","pending_review").order("created_at",{ascending:true});
    if(error)setMessage(error.message);
    setItems((data??[]) as unknown as Listing[]);
    const {data:cancellationData,error:cancellationError}=await supabase.rpc("admin_list_cancellation_requests");
    if(cancellationError)setMessage("Cancellation requests could not be loaded: "+cancellationError.message);
    setCancellationRequests((cancellationData??[]) as CancellationRequest[]);
    setLoading(false);
  }

  useEffect(()=>{load();},[]);

  async function decideCancellation(request:CancellationRequest,decision:"approved"|"rejected") {
    const note = window.prompt(decision==="approved" ? "Optional note for the seller and customer:" : "Please explain why this cancellation request is being rejected:");
    if(note===null)return;
    if(decision==="rejected" && note.trim().length<5){setMessage("Please provide a short reason when rejecting a cancellation.");return;}
    if(!window.confirm(decision==="approved" ? "Approve this cancellation? The seller's part of the order will be cancelled." : "Reject this cancellation? The seller's order will return to active processing."))return;
    setBusyId(request.request_id);setMessage("");
    const {error}=await supabase.rpc("admin_decide_cancellation",{
      target_order_id:request.order_id,target_shop_id:request.shop_id,decision,admin_note:note.trim()||null
    });
    if(error)setMessage(error.message);
    else setMessage(decision==="approved" ? "Cancellation approved. Seller and customer have been notified." : "Cancellation rejected. Seller and customer have been notified.");
    setBusyId("");
    await load();
  }

  async function inviteAdmin(email:string) {
    setAdminBusy(true);setMessage("");
    try {
      const {data:{session}}=await supabase.auth.getSession();
      const response=await fetch("/api/admin/invite",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(session?.access_token||"")},body:JSON.stringify({email})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Unable to add administrator.");
      setMessage(result.message||"Administrator invitation sent.");
      const {data}=await supabase.rpc("admin_list_accounts");setAdmins((data??[]) as AdminAccount[]);
      setAdminEmail("");
    } catch(error) {setMessage(error instanceof Error?error.message:"Unable to add administrator.");}
    finally {setAdminBusy(false);}
  }

  async function changeAdminAccess(email:string,makeAdmin:boolean) {
    setAdminBusy(true);setMessage("");
    const {error}=await supabase.rpc("admin_set_account_access",{target_email:email,make_admin:makeAdmin});
    if(error)setMessage(error.message);
    else {setMessage("Administrator access removed from "+email+".");const {data}=await supabase.rpc("admin_list_accounts");setAdmins((data??[]) as AdminAccount[]);}
    setAdminBusy(false);
  }

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
      <div className="admin-heading"><div><div className="eyebrow">ISLAND EXPRESS · ADMINISTRATION</div><h1>Product moderation</h1><p>Review listings before they become visible to shoppers.</p></div><div className="admin-heading-actions"><Link className="admin-refresh" href="/notifications"><Bell size={15}/> Notifications{unreadNotifications>0?` (${unreadNotifications})`:""}</Link><Link className="admin-refresh" href="/admin/campaigns"><Megaphone size={15}/> Promotional Campaigns</Link><Link className="admin-refresh" href="/admin/support"><Headset size={15}/> Customer Care Inbox</Link><Link className="admin-refresh" href="/admin/reviews"><Star size={15}/> Product Reviews</Link><Link className="admin-refresh" href="/admin/withdrawals"><Wallet size={15}/> Seller Withdrawals</Link><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button></div></div>
      <div className="admin-stats"><ShieldCheck size={20}/><b>{items.length}</b><span>Listings awaiting review</span></div>
      <section className="admin-account-manager">
        <div className="admin-account-manager-heading"><div><div className="eyebrow">ORDER MANAGEMENT</div><h2>Seller cancellation requests</h2><p>Review seller requests before an order is cancelled. Approval or rejection is sent to the seller and customer.</p></div><span>{cancellationRequests.length} awaiting review</span></div>
        {cancellationRequests.length===0 ? <div className="admin-empty"><Package size={28}/><b>No cancellation requests</b><span>New seller requests will appear here.</span></div> :
          <div className="admin-list">{cancellationRequests.map(request=><article className="admin-item" key={request.request_id}>
            <div className="admin-info">
              <div className="admin-item-meta">ORDER {request.order_id.slice(0,8).toUpperCase()} · {request.shop_name}</div>
              <h2>Cancellation requested</h2>
              <p><b>Seller's reason:</b> {request.seller_note||"No reason supplied."}</p>
              <p><b>Customer:</b> {request.customer_name} · <b>Order total:</b> SCR {Number(request.total_scr).toLocaleString()}</p>
              <small>Requested {new Date(request.requested_at).toLocaleString()}</small>
            </div>
            <div className="admin-actions">
              <button disabled={busyId===request.request_id} className="approve" onClick={()=>decideCancellation(request,"approved")}><Check size={15}/> Approve cancellation</button>
              <button disabled={busyId===request.request_id} className="reject" onClick={()=>decideCancellation(request,"rejected")}><X size={15}/> Reject request</button>
            </div>
          </article>)}</div>}
      </section>

      <section className="admin-account-manager">
        <div className="admin-account-manager-heading"><div><div className="eyebrow">ACCESS CONTROL</div><h2><Users size={18}/> Administrator accounts</h2><p>Invite a new administrator by email. They will receive a secure link to create their password.</p></div><span>{admins.length} admin{admins.length===1?"":"s"}</span></div>
        <form className="admin-add-account-form" onSubmit={e=>{e.preventDefault();if(adminEmail.trim())inviteAdmin(adminEmail.trim());}}>
          <input type="email" required placeholder="Enter email address" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/>
          <button type="submit" disabled={adminBusy}><UserPlus size={15}/>{adminBusy?"Sending…":"Invite administrator"}</button>
        </form>
        <small className="admin-account-hint">The invited person sets their own password from the email link, then signs in at the Admin portal. No authenticator app is required.</small>
        <div className="admin-account-list">{admins.map(account=><div className="admin-account-row" key={account.user_id}><span><ShieldCheck size={15}/>{account.email}</span><button type="button" disabled={adminBusy} onClick={()=>{if(window.confirm("Remove administrator access from "+account.email+"?"))changeAdminAccess(account.email,false);}}><UserMinus size={14}/> Remove access</button></div>)}</div>
      </section>
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