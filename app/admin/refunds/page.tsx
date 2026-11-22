"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowLeft,RefreshCw,Image as ImageIcon,Video,Check,X,ShieldCheck} from "lucide-react";
import {supabase} from "../../../lib/supabase";

type Refund={id:string;order_id:string;customer_id:string;reason:string;photo_path:string;video_path:string;status:string;admin_note:string|null;created_at:string;orders:{customer_name:string;total_scr:number}|null};
export default function AdminRefundsPage(){
 const router=useRouter();const [rows,setRows]=useState<Refund[]>([]);const [loading,setLoading]=useState(true);const [allowed,setAllowed]=useState(false);const [message,setMessage]=useState("");const [busy,setBusy]=useState("");const [urls,setUrls]=useState<Record<string,{photo:string;video:string}>>({});
 async function load(){
  setLoading(true);const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace("/admin/login");return;}
  const {data:profile}=await supabase.from("profiles").select("is_admin").eq("id",user.id).single();if(!profile?.is_admin){setAllowed(false);setLoading(false);return;}setAllowed(true);
  const {data,error}=await supabase.from("refund_requests").select("id,order_id,customer_id,reason,photo_path,video_path,status,admin_note,created_at,orders(customer_name,total_scr)").order("created_at",{ascending:false});
  if(error){setMessage(error.message);setRows([]);setLoading(false);return;}
  const list=(data??[]) as unknown as Refund[];setRows(list);
  const signed:Record<string,{photo:string;video:string}>={};
  for(const item of list){const [p,v]=await Promise.all([supabase.storage.from("refund-evidence").createSignedUrl(item.photo_path,900),supabase.storage.from("refund-evidence").createSignedUrl(item.video_path,900)]);if(p.data?.signedUrl&&v.data?.signedUrl)signed[item.id]={photo:p.data.signedUrl,video:v.data.signedUrl};}
  setUrls(signed);setLoading(false);
 }
 useEffect(()=>{load();},[]);
 async function decide(item:Refund,decision:"approved"|"rejected"){
  const note=window.prompt(decision==="approved"?"Optional note for the customer:":"Please explain why the refund is being rejected:");
  if(note===null)return;if(decision==="rejected"&&note.trim().length<5){setMessage("Please provide a clear reason of at least 5 characters.");return;}
  if(!window.confirm(decision==="approved"?"Approve this refund request?":"Reject this refund request?"))return;
  setBusy(item.id);setMessage("");const {error}=await supabase.rpc("admin_decide_refund",{target_request_id:item.id,decision,response_note:note.trim()||null});
  if(error)setMessage(error.message);else setMessage("Refund request "+decision+". The customer has been notified.");setBusy("");await load();
 }
 if(loading)return <main className="account-page"><section className="account-card">Loading refund requests…</section></main>;
 if(!allowed)return <main className="account-page"><section className="account-card"><ShieldCheck size={32}/><h1>Admin access required</h1><Link href="/admin/login" className="primary account-submit">Admin sign in</Link></section></main>;
 return <main className="admin-page"><header className="seller-dash-header"><Link href="/admin" className="account-back"><ArrowLeft size={16}/> Admin Centre</Link><Link href="/" className="account-brand">island<span>xpress</span></Link></header><div className="admin-wrap"><div className="admin-heading"><div><div className="eyebrow">ORDER MANAGEMENT</div><h1>Refund requests</h1><p>Review customer reasons and private photo/video evidence before making a decision.</p></div><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button></div>{message&&<div className="account-message">{message}</div>}{rows.length===0?<div className="admin-empty">No refund requests have been submitted.</div>:<div className="admin-list">{rows.map(item=><article className="admin-item" key={item.id}><div className="admin-info"><div className="admin-item-meta">ORDER {item.order_id.slice(0,8).toUpperCase()} · {item.orders?.customer_name||"Customer"}</div><h2>Refund request · {item.status}</h2><p>{item.reason}</p><b>Order total: SCR {Number(item.orders?.total_scr??0).toLocaleString()}</b><small>Submitted {new Date(item.created_at).toLocaleString()}</small>{item.admin_note&&<p>Previous admin note: {item.admin_note}</p>}<div className="refund-admin-evidence">{urls[item.id]?<><a href={urls[item.id].photo} target="_blank" rel="noreferrer"><ImageIcon size={16}/> View photo evidence</a><a href={urls[item.id].video} target="_blank" rel="noreferrer"><Video size={16}/> View video evidence</a></>:<span>Evidence links are loading or unavailable. Refresh to retry.</span>}</div></div>{item.status==="pending"&&<div className="admin-actions"><button className="approve" disabled={busy===item.id} onClick={()=>decide(item,"approved")}><Check size={15}/> Approve refund</button><button className="reject" disabled={busy===item.id} onClick={()=>decide(item,"rejected")}><X size={15}/> Reject request</button></div>}</article>)}</div>}</div></main>;
}
