"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, Headset, Send, RefreshCw, UserRound } from "lucide-react";

type Ticket={id:string;customer_id:string;subject:string;category:string;status:string;handoff_requested:boolean;created_at:string};
type Msg={id:string;sender_type:string;body:string;created_at:string};

export default function AdminSupportPage(){
 const router=useRouter();
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [active,setActive]=useState("");
 const [messages,setMessages]=useState<Msg[]>([]);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 async function load(){
  setLoading(true);
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){router.replace("/admin/login");return;}
  const {data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal?.currentLevel!=="aal2"){router.replace("/admin/login");return;}
  const {data:profile}=await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
  if(!profile?.is_admin){setNotice("Administrator access required.");setLoading(false);return;}
  const {data,error}=await supabase.from("support_conversations").select("id,customer_id,subject,category,status,handoff_requested,created_at").order("updated_at",{ascending:false});
  if(error)setNotice(error.message);
  setTickets((data??[]) as Ticket[]);setLoading(false);
 }
 async function openTicket(id:string){
  setActive(id);
  const {data,error}=await supabase.from("support_messages").select("id,sender_type,body,created_at").eq("conversation_id",id).order("created_at",{ascending:true});
  if(error)setNotice(error.message);
  setMessages((data??[]) as Msg[]);
 }
 useEffect(()=>{load();},[]);
 async function reply(e:FormEvent){
  e.preventDefault();if(!draft.trim()||!active||busy)return;
  setBusy(true);setNotice("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setNotice("Please sign in again.");setBusy(false);return;}
  const {error}=await supabase.from("support_messages").insert({conversation_id:active,sender_id:user.id,sender_type:"admin",body:draft.trim()});
  if(error)setNotice(error.message);
  else{setDraft("");await openTicket(active);await load();}
  setBusy(false);
 }
 async function setStatus(status:"in_progress"|"resolved"){
  if(!active)return;setBusy(true);
  const {error}=await supabase.from("support_conversations").update({status,handoff_requested:status!=="resolved"}).eq("id",active);
  if(error)setNotice(error.message);else{setNotice(status==="resolved"?"Conversation marked resolved.":"Conversation assigned to Customer Care.");await load();}
  setBusy(false);
 }
 if(loading)return <main className="admin-page"><div className="account-card">Loading Customer Care…</div></main>;
 return <main className="admin-page">
  <header className="seller-dash-header"><Link href="/admin" className="account-back"><ArrowLeft size={16}/> Admin Centre</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
  <div className="admin-wrap">
   <div className="admin-heading"><div><div className="eyebrow">ISLAND EXPRESS · SUPPORT</div><h1>Customer Care Inbox</h1><p>Manage AI handovers and reply to customer support requests. Sellers cannot access this inbox.</p></div><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
   {notice&&<div className="account-message">{notice}</div>}
   <div className="admin-support-layout">
    <aside className="admin-support-list"><h2>Support requests ({tickets.length})</h2>{tickets.map(t=><button key={t.id} className={active===t.id?"active":""} onClick={()=>openTicket(t.id)}><b>{t.subject}</b><small>{t.category.replaceAll("_"," ")} · {t.status.replaceAll("_"," ")}</small>{t.handoff_requested&&<em>Needs human reply</em>}</button>)}{!tickets.length&&<p>No support requests yet.</p>}</aside>
    <section className="admin-support-chat">{!active?<div className="admin-empty"><Headset size={34}/><b>Select a conversation</b><span>Customer messages and AI replies will appear here.</span></div>:<>
      <div className="admin-support-toolbar"><b>{tickets.find(t=>t.id===active)?.subject||"Support conversation"}</b><div><button onClick={()=>setStatus("in_progress")} disabled={busy}>Take over</button><button onClick={()=>setStatus("resolved")} disabled={busy}>Resolve</button></div></div>
      <div className="admin-support-messages">{messages.map(m=><article key={m.id} className={"support-message "+m.sender_type}><span className="support-message-avatar">{m.sender_type==="customer"?<UserRound size={15}/>:m.sender_type==="ai"?<Headset size={15}/>:<Headset size={15}/>}</span><div><small>{m.sender_type==="customer"?"Customer":m.sender_type==="ai"?"AI Assistant":"You · Customer Care"}</small><p>{m.body}</p></div></article>)}</div>
      <form className="support-compose" onSubmit={reply}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Reply to customer…" maxLength={5000}/><button disabled={busy||!draft.trim()}><Send size={17}/></button></form>
    </>}</section>
   </div>
  </div>
 </main>;
}
