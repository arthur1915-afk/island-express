"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, Ticket, Plus, Trash2, Pause, Play } from "lucide-react";

type Voucher = { id:string; code:string; title:string; discount_type:"percentage"|"fixed"; discount_value:number; minimum_spend_scr:number; starts_at:string; ends_at:string|null; max_redemptions:number|null; redemption_count:number; is_active:boolean };
const blank = { code:"", title:"", discount_type:"percentage" as "percentage"|"fixed", discount_value:"10", minimum_spend_scr:"0", starts_at:"", ends_at:"", max_redemptions:"" };

export default function SellerVouchersPage() {
  const router = useRouter();
  const [shopId,setShopId] = useState("");
  const [shopName,setShopName] = useState("Your shop");
  const [rows,setRows] = useState<Voucher[]>([]);
  const [draft,setDraft] = useState(blank);
  const [editing,setEditing] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");

  async function load() {
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const {data:profile} = await supabase.from("profiles").select("role").eq("id",user.id).single();
    if (profile?.role !== "seller") { router.replace("/account"); return; }
    const {data:shops,error:shopError} = await supabase.from("shops").select("id,name").eq("owner_id",user.id).limit(1);
    if (shopError || !shops?.length) { setMessage("Create your shop before managing vouchers."); setLoading(false); return; }
    setShopId(shops[0].id); setShopName(shops[0].name);
    const {data,error} = await supabase.from("shop_vouchers").select("*").eq("shop_id",shops[0].id).order("created_at",{ascending:false});
    if (error) setMessage("Could not load vouchers. Run the shop vouchers SQL setup first. " + error.message);
    setRows((data??[]) as Voucher[]);
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  function startEdit(v:Voucher) {
    setEditing(v.id);
    setDraft({code:v.code,title:v.title,discount_type:v.discount_type,discount_value:String(v.discount_value),minimum_spend_scr:String(v.minimum_spend_scr),starts_at:new Date(v.starts_at).toISOString().slice(0,16),ends_at:v.ends_at?new Date(v.ends_at).toISOString().slice(0,16):"",max_redemptions:v.max_redemptions===null?"":String(v.max_redemptions)});
    setMessage("");
  }
  function reset() { setEditing(""); setDraft(blank); }

  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value=Number(draft.discount_value), minimum=Number(draft.minimum_spend_scr), cap=draft.max_redemptions.trim()?Number(draft.max_redemptions):null;
    if (!draft.code.trim() || !draft.title.trim() || !Number.isFinite(value) || value<=0 || !Number.isFinite(minimum) || minimum<0 || (draft.discount_type==="percentage" && value>100) || (cap!==null && (!Number.isInteger(cap)||cap<1))) { setMessage("Check the voucher code, title, discount, minimum spend and redemption limit."); return; }
    const start=draft.starts_at?new Date(draft.starts_at).toISOString():new Date().toISOString();
    const end=draft.ends_at?new Date(draft.ends_at).toISOString():null;
    if (end && new Date(end)<=new Date(start)) { setMessage("The end date must be after the start date."); return; }
    setBusy(true); setMessage("");
    const payload={shop_id:shopId,code:draft.code.trim().toUpperCase().replace(/\\s+/g,""),title:draft.title.trim(),discount_type:draft.discount_type,discount_value:value,minimum_spend_scr:minimum,starts_at:start,ends_at:end,max_redemptions:cap};
    const result=editing?await supabase.from("shop_vouchers").update(payload).eq("id",editing).eq("shop_id",shopId):await supabase.from("shop_vouchers").insert(payload);
    if (result.error) setMessage(result.error.message);
    else { setMessage(editing?"Voucher updated.":"Voucher created."); reset(); await load(); }
    setBusy(false);
  }

  async function toggle(v:Voucher) {
    setBusy(true); setMessage("");
    const {error}=await supabase.from("shop_vouchers").update({is_active:!v.is_active}).eq("id",v.id).eq("shop_id",shopId);
    if (error) setMessage(error.message); else await load();
    setBusy(false);
  }
  async function remove(v:Voucher) {
    if (!window.confirm("Delete voucher "+v.code+"?")) return;
    setBusy(true); const {error}=await supabase.from("shop_vouchers").delete().eq("id",v.id).eq("shop_id",shopId);
    if (error) setMessage(error.message); else {setRows(current=>current.filter(x=>x.id!==v.id));setMessage("Voucher deleted.");}
    setBusy(false);
  }

  return <main className="seller-dashboard">
    <header className="seller-dash-header"><Link href="/seller" className="account-back"><ArrowLeft size={16}/> Seller Centre</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
    <div className="seller-orders-wrap">
      <div className="seller-orders-heading"><div><div className="eyebrow">SELLER CENTRE · PROMOTIONS</div><h1>{shopName} vouchers</h1><p>Create and manage discount codes for your shop.</p></div><Link href={shopId ? "/shop/"+shopId : "/seller"} className="seller-orders-link"><Ticket size={16}/> View public shop</Link></div>
      {message&&<div className="account-message" role="status">{message}</div>}
      <section className="seller-dash-panel">
        <h2>{editing?"Edit voucher":"Create a voucher"}</h2>
        <p>Set a percentage or fixed SCR discount, minimum spend and optional validity or redemption limits.</p>
        <form className="account-form" onSubmit={save}>
          <div className="seller-form-row"><label>Voucher code<input required maxLength={24} value={draft.code} onChange={e=>setDraft({...draft,code:e.target.value.toUpperCase().replace(/\\s/g,"")})} placeholder="e.g. ISLAND10"/></label><label>Display title<input required maxLength={80} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Weekend special"/></label></div>
          <div className="seller-form-row"><label>Discount type<select value={draft.discount_type} onChange={e=>setDraft({...draft,discount_type:e.target.value as "percentage"|"fixed"})}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (SCR)</option></select></label><label>Discount value<input required type="number" min="0.01" step="0.01" max={draft.discount_type==="percentage"?100:undefined} value={draft.discount_value} onChange={e=>setDraft({...draft,discount_value:e.target.value})}/></label></div>
          <div className="seller-form-row"><label>Minimum spend (SCR)<input type="number" min="0" step="0.01" value={draft.minimum_spend_scr} onChange={e=>setDraft({...draft,minimum_spend_scr:e.target.value})}/></label><label>Maximum redemptions (optional)<input type="number" min="1" step="1" value={draft.max_redemptions} onChange={e=>setDraft({...draft,max_redemptions:e.target.value})} placeholder="Unlimited"/></label></div>
          <div className="seller-form-row"><label>Starts at<input type="datetime-local" value={draft.starts_at} onChange={e=>setDraft({...draft,starts_at:e.target.value})}/></label><label>Ends at (optional)<input type="datetime-local" value={draft.ends_at} onChange={e=>setDraft({...draft,ends_at:e.target.value})}/></label></div>
          <div className="seller-shopfront-actions"><button className="primary account-submit" disabled={busy}>{busy?"Saving…":editing?"Save voucher":"Create voucher"}</button>{editing&&<button type="button" className="secondary" onClick={reset}>Cancel</button>}</div>
        </form>
      </section>
      <section className="seller-dash-panel">
        <h2>Your vouchers</h2>
        {loading?<div className="seller-order-empty">Loading vouchers…</div>:rows.length===0?<div className="seller-empty"><Ticket size={30}/><b>No vouchers yet</b><span>Create a discount code to promote your shop.</span></div>:<div className="seller-voucher-list">{rows.map(v=><article className="seller-voucher-card" key={v.id}><div className="seller-voucher-code"><Ticket size={20}/><b>{v.code}</b><span>{v.title}</span></div><div className="seller-voucher-meta"><strong>{v.discount_type==="percentage"?v.discount_value+"% off":"SCR "+Number(v.discount_value).toFixed(2)+" off"}</strong><small>Minimum spend: SCR {Number(v.minimum_spend_scr).toFixed(2)} · {v.redemption_count}{v.max_redemptions===null?"":"/"+v.max_redemptions} redemptions</small><small>{v.ends_at?"Ends "+new Date(v.ends_at).toLocaleString():"No end date"}</small></div><span className={v.is_active?"seller-voucher-active":"seller-voucher-paused"}>{v.is_active?"Active":"Paused"}</span><div className="seller-voucher-actions"><button disabled={busy} onClick={()=>startEdit(v)}>Edit</button><button disabled={busy} onClick={()=>toggle(v)}>{v.is_active?<Pause size={14}/>:<Play size={14}/>} {v.is_active?"Pause":"Activate"}</button><button disabled={busy} onClick={()=>remove(v)}><Trash2 size={14}/> Delete</button></div></article>)}</div>}
      </section>
    </div>
  </main>;
}
