"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, CalendarDays, ImagePlus, Megaphone, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";

type Campaign = {
  id: string; eyebrow: string; title: string; subtitle: string | null; description: string | null;
  image_url: string | null; cta_label: string; cta_url: string; background_style: string;
  starts_at: string; ends_at: string | null; is_active: boolean; sort_order: number;
};
type Draft = Omit<Campaign,"id"|"starts_at"|"ends_at"> & { id?: string; starts_at: string; ends_at: string };
const blank: Draft = {
  eyebrow:"SPECIAL CAMPAIGN",title:"",subtitle:"",description:"",image_url:"",cta_label:"Explore offers",
  cta_url:"/search",background_style:"island",starts_at:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16),
  ends_at:"",is_active:false,sort_order:0
};
const dateInput=(value:string|null)=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):"";

export default function AdminCampaignsPage(){
 const router=useRouter();
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [draft,setDraft]=useState<Draft>(blank);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const [editing,setEditing]=useState(false);
 async function load(){
  setLoading(true);setNotice("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){router.replace("/admin/login");return;}
  const {data:profile}=await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
  if(!profile?.is_admin){setNotice("Administrator access required.");setLoading(false);return;}
  const {data,error}=await supabase.from("promotional_campaigns").select("*").order("sort_order").order("created_at",{ascending:false});
  if(error)setNotice(error.message);
  setCampaigns((data??[]) as Campaign[]);setLoading(false);
 }
 useEffect(()=>{load();},[]);
 function edit(c:Campaign){
  setDraft({...c,subtitle:c.subtitle??"",description:c.description??"",image_url:c.image_url??"",starts_at:dateInput(c.starts_at),ends_at:dateInput(c.ends_at)});
  setEditing(true);setNotice("");window.scrollTo({top:0,behavior:"smooth"});
 }
 function newCampaign(){setDraft({...blank,starts_at:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)});setEditing(true);setNotice("");}
 async function save(e:React.FormEvent){
  e.preventDefault();setSaving(true);setNotice("");
  if(draft.ends_at && new Date(draft.ends_at)<=new Date(draft.starts_at)){setNotice("End date must be later than the start date.");setSaving(false);return;}
  if(draft.image_url && !/^https:\/\//i.test(draft.image_url)){setNotice("Banner image must use a secure https:// URL.");setSaving(false);return;}
  if(!draft.cta_url.startsWith("/")&&!/^https:\/\//i.test(draft.cta_url)){setNotice("Button link must be a site path or secure https:// URL.");setSaving(false);return;}
  const payload={eyebrow:draft.eyebrow.trim()||"SPECIAL CAMPAIGN",title:draft.title.trim(),subtitle:draft.subtitle.trim()||null,description:draft.description.trim()||null,image_url:draft.image_url.trim()||null,cta_label:draft.cta_label.trim()||"Explore offers",cta_url:draft.cta_url.trim(),background_style:draft.background_style,starts_at:new Date(draft.starts_at).toISOString(),ends_at:draft.ends_at?new Date(draft.ends_at).toISOString():null,is_active:draft.is_active,sort_order:Number(draft.sort_order)||0,updated_at:new Date().toISOString()};
  const result=draft.id?await supabase.from("promotional_campaigns").update(payload).eq("id",draft.id):await supabase.from("promotional_campaigns").insert(payload);
  if(result.error)setNotice(result.error.message);
  else{setNotice("Campaign saved.");setEditing(false);await load();}
  setSaving(false);
 }
 async function remove(c:Campaign){
  if(!window.confirm("Delete the campaign “"+c.title+"”?"))return;
  const {error}=await supabase.from("promotional_campaigns").delete().eq("id",c.id);
  if(error)setNotice(error.message);else{setCampaigns(old=>old.filter(x=>x.id!==c.id));setNotice("Campaign deleted.");}
 }
 async function toggle(c:Campaign){
  const {error}=await supabase.from("promotional_campaigns").update({is_active:!c.is_active,updated_at:new Date().toISOString()}).eq("id",c.id);
  if(error)setNotice(error.message);else setCampaigns(old=>old.map(x=>x.id===c.id?{...x,is_active:!x.is_active}:x));
 }
 if(loading)return <main className="account-page"><section className="account-card">Loading campaigns…</section></main>;
 return <main className="admin-page">
  <header className="seller-dash-header"><Link href="/admin" className="account-back"><ArrowLeft size={16}/> Admin Centre</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
  <div className="admin-wrap">
   <div className="admin-heading"><div><div className="eyebrow">ISLAND EXPRESS · MARKETING</div><h1><Megaphone size={25}/> Promotional campaigns</h1><p>Manage the rotating promotions shown to shoppers on the marketplace homepage.</p></div><div className="admin-heading-actions"><button className="admin-refresh" onClick={load}><RefreshCw size={15}/> Refresh</button><button className="admin-refresh campaign-add-button" onClick={newCampaign}><Plus size={15}/> New campaign</button></div></div>
   {notice&&<div className="account-message">{notice}</div>}
   {editing&&<form className="campaign-editor" onSubmit={save}>
    <div className="campaign-editor-heading"><div><b>{draft.id?"Edit campaign":"Create a campaign"}</b><small>Set the message, schedule and destination for shoppers.</small></div><button type="button" className="campaign-close" onClick={()=>setEditing(false)} aria-label="Close"><X size={18}/></button></div>
    <div className="campaign-form-grid">
     <label>Small label<input value={draft.eyebrow} onChange={e=>setDraft({...draft,eyebrow:e.target.value})} maxLength={50}/></label>
     <label>Campaign title<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} maxLength={100} placeholder="e.g. Island Shopping Days"/></label>
     <label className="campaign-form-wide">Subtitle<input value={draft.subtitle} onChange={e=>setDraft({...draft,subtitle:e.target.value})} placeholder="A short headline or offer"/></label>
     <label className="campaign-form-wide">Description<textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} rows={2} placeholder="Tell shoppers what the promotion is about."/></label>
     <label className="campaign-form-wide">Banner image URL (optional)<input type="url" value={draft.image_url} onChange={e=>setDraft({...draft,image_url:e.target.value})} placeholder="https://…"/></label>
     <label>Button text<input value={draft.cta_label} onChange={e=>setDraft({...draft,cta_label:e.target.value})} maxLength={35}/></label>
     <label>Button link<input required value={draft.cta_url} onChange={e=>setDraft({...draft,cta_url:e.target.value})} placeholder="/search?q=…"/></label>
     <label>Visual style<select value={draft.background_style} onChange={e=>setDraft({...draft,background_style:e.target.value})}><option value="island">Island green</option><option value="sunset">Seychelles sunset</option><option value="ocean">Ocean blue</option><option value="market">Market orange</option></select></label>
     <label>Display order<input type="number" min="0" value={draft.sort_order} onChange={e=>setDraft({...draft,sort_order:Number(e.target.value)})}/></label>
     <label>Start date and time<input type="datetime-local" required value={draft.starts_at} onChange={e=>setDraft({...draft,starts_at:e.target.value})}/></label>
     <label>End date and time (optional)<input type="datetime-local" value={draft.ends_at} onChange={e=>setDraft({...draft,ends_at:e.target.value})}/></label>
    </div>
    <label className="campaign-active-toggle"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft({...draft,is_active:e.target.checked})}/> Publish this campaign when its start date arrives</label>
    <div className="campaign-editor-actions"><button type="button" className="campaign-cancel" onClick={()=>setEditing(false)}>Cancel</button><button className="campaign-save" disabled={saving}>{saving?"Saving…":"Save campaign"}</button></div>
   </form>}
   {campaigns.length===0?<div className="admin-empty"><Megaphone size={35}/><b>No campaigns created yet</b><span>Create your first promotion to display a rotating banner on the homepage.</span><button className="campaign-save" onClick={newCampaign}>Create first campaign</button></div>:
    <div className="campaign-admin-list">{campaigns.map(c=><article className="campaign-admin-card" key={c.id}>
     <div className={"campaign-admin-preview campaign-style-"+c.background_style}>{c.image_url&&<img src={c.image_url} alt=""/>}<span>{c.eyebrow}</span><b>{c.title}</b><small>{c.subtitle||c.description||"No supporting message"}</small></div>
     <div className="campaign-admin-details"><div><b>{c.title}</b><small><CalendarDays size={13}/> {new Date(c.starts_at).toLocaleString()} {c.ends_at?" – "+new Date(c.ends_at).toLocaleString():" · No end date"}</small></div><span className={c.is_active?"campaign-status-on":"campaign-status-off"}>{c.is_active?"Published":"Paused"}</span><div className="campaign-admin-actions"><button onClick={()=>toggle(c)}>{c.is_active?"Pause":"Publish"}</button><button onClick={()=>edit(c)}><Pencil size={14}/> Edit</button><button className="campaign-delete" onClick={()=>remove(c)}><Trash2 size={14}/> Delete</button></div></div>
    </article>)}</div>}
  </div>
 </main>;
}
