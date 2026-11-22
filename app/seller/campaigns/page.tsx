"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Megaphone, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";

type Campaign = { id:string; title:string; subtitle:string|null; starts_at:string; ends_at:string|null };
type Product = { id:string; title:string; price_scr:number; image_urls:string[]; status:string };
type Submission = { id:string; campaign_id:string; product_id:string; discount_percent:number };

export default function SellerCampaignsPage(){
 const router=useRouter();
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [submissions,setSubmissions]=useState<Submission[]>([]);
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [discounts,setDiscounts]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{(async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){router.replace("/account");return;}
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="seller"){router.replace("/account");return;}
  const now=new Date().toISOString();
  const [shopResult,campaignResult]=await Promise.all([
   supabase.from("shops").select("id").eq("owner_id",user.id).limit(1).maybeSingle(),
   supabase.from("promotional_campaigns").select("id,title,subtitle,starts_at,ends_at").eq("is_active",true).lte("starts_at",now).or("ends_at.is.null,ends_at.gt."+now).order("sort_order")
  ]);
  if(!shopResult.data){setNotice("Your seller shop could not be found.");setLoading(false);return;}
  const [productResult,submissionResult]=await Promise.all([
   supabase.from("products").select("id,title,price_scr,image_urls,status").eq("shop_id",shopResult.data.id).eq("status","approved").or("is_archived.is.null,is_archived.eq.false").order("created_at",{ascending:false}),
   supabase.from("promotional_campaign_products").select("id,campaign_id,product_id,discount_percent").eq("seller_id",user.id)
  ]);
  setProducts((productResult.data??[]) as Product[]);
  setCampaigns((campaignResult.data??[]) as Campaign[]);
  setSubmissions((submissionResult.data??[]) as Submission[]);
  setLoading(false);
 })();},[router]);
 async function add(campaignId:string){
  const productId=selected[campaignId]; if(!productId){setNotice("Choose one of your approved products first.");return;}
  const discount=Number(discounts[campaignId]??0); if(!Number.isFinite(discount)||discount<0||discount>90){setNotice("Enter a discount between 0% and 90%.");return;}
  setBusy(campaignId);setNotice("");
  const {data:{user}}=await supabase.auth.getUser();if(!user){setNotice("Please sign in again.");setBusy("");return;}
  const {data,error}=await supabase.from("promotional_campaign_products").insert({campaign_id:campaignId,product_id:productId,seller_id:user.id,discount_percent:Number(discounts[campaignId]??0)}).select("id,campaign_id,product_id,discount_percent").single();
  if(error)setNotice(error.code==="23505"?"That product is already included in this campaign.":error.message);
  else{setSubmissions(old=>[...old,data as Submission]);setSelected(old=>({...old,[campaignId]:""}));setDiscounts(old=>({...old,[campaignId]:"0"}));setNotice("Product added to the campaign.");}
  setBusy("");
 }
 async function remove(row:Submission){
  setBusy(row.id);setNotice("");
  const {error}=await supabase.from("promotional_campaign_products").delete().eq("id",row.id);
  if(error)setNotice(error.message);else setSubmissions(old=>old.filter(x=>x.id!==row.id));
  setBusy("");
 }
 if(loading)return <main className="account-page"><section className="account-card">Loading campaigns…</section></main>;
 return <main className="seller-dashboard">
  <header className="seller-dash-header"><Link href="/seller" className="account-back"><ArrowLeft size={16}/> Seller Centre</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
  <div className="seller-dash-wrap">
   <div className="seller-dash-title"><div><div className="eyebrow">SELLER CENTRE</div><h1><Megaphone size={25}/> Promotional campaigns</h1><p>Submit your approved products to live islandXpress campaigns so shoppers can discover your offers.</p></div></div>
   {notice&&<div className="account-message">{notice}</div>}
   {campaigns.length===0?<section className="seller-dash-panel"><h2>No live campaigns right now</h2><p>When islandXpress publishes a campaign, it will appear here and you can submit products.</p></section>:
    <div className="seller-tools-grid">{campaigns.map(c=>{
      const existing=submissions.filter(s=>s.campaign_id===c.id);
      const available=products.filter(p=>!existing.some(s=>s.product_id===p.id));
      return <section className="seller-dash-panel" key={c.id}>
       <div className="eyebrow">LIVE CAMPAIGN</div><h2>{c.title}</h2>{c.subtitle&&<p>{c.subtitle}</p>}
       <p>{new Date(c.starts_at).toLocaleDateString()} – {c.ends_at?new Date(c.ends_at).toLocaleDateString():"No end date"}</p>
       <label className="account-form">Choose an approved product<select value={selected[c.id]??""} onChange={e=>setSelected(old=>({...old,[c.id]:e.target.value}))}><option value="">Select a product</option>{available.map(p=><option key={p.id} value={p.id}>{p.title} · SCR {Number(p.price_scr).toLocaleString()}</option>)}</select></label>
       <label className="account-form">Discount for this campaign (%)<input type="number" min="0" max="90" step="1" value={discounts[c.id]??"0"} onChange={e=>setDiscounts(old=>({...old,[c.id]:e.target.value}))} placeholder="0"/></label>
       <small>Enter 50 for 50% off. Leave at 0 for no discount.</small>
       <button className="primary account-submit" disabled={!!busy||!available.length} onClick={()=>add(c.id)}><Plus size={16}/> {busy===c.id?"Adding…":"Add product to campaign"}</button>
       <div style={{marginTop:18}}><b>Your submitted products ({existing.length})</b>{existing.map(row=>{const p=products.find(x=>x.id===row.product_id);return <div key={row.id} className="seller-balance-footer"><span>{p?.title??"Product submitted"} · {row.discount_percent>0?row.discount_percent+"% off":"No discount"}</span><button type="button" className="campaign-delete" disabled={!!busy} onClick={()=>remove(row)}><Trash2 size={14}/> Remove</button></div>})}{!existing.length&&<p>You have not submitted any products to this campaign yet.</p>}</div>
      </section>;
    })}</div>}
   </div>
  </main>;
}
