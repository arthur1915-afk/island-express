"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, ShoppingBag, RefreshCw } from "lucide-react";

type Campaign = { id:string; eyebrow:string; title:string; subtitle:string|null; description:string|null; image_url:string|null; background_style:string };
type Product = { id:string; title:string; description:string|null; price_scr:number; image_urls:string[]|null; category:string; shops:{name:string;island:string|null}|null };

export default function CampaignOffersPage(){
 const params=useParams<{id:string}>();
 const campaignId=String(params.id??"");
 const [campaign,setCampaign]=useState<Campaign|null>(null);
 const [products,setProducts]=useState<Product[]>([]);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");
 async function load(){
  if(!campaignId)return;
  setLoading(true);setNotice("");
  const now=new Date().toISOString();
  const {data:campaignRow,error:campaignError}=await supabase.from("promotional_campaigns")
   .select("id,eyebrow,title,subtitle,description,image_url,background_style")
   .eq("id",campaignId).eq("is_active",true).lte("starts_at",now)
   .or("ends_at.is.null,ends_at.gt."+now).maybeSingle();
  if(campaignError){setNotice("Could not load this campaign: "+campaignError.message);setLoading(false);return;}
  if(!campaignRow){setNotice("This campaign is not currently published or has expired.");setLoading(false);return;}
  setCampaign(campaignRow as Campaign);
  const {data:submissionRows,error:submissionError}=await supabase.from("promotional_campaign_products")
   .select("product_id").eq("campaign_id",campaignId);
  if(submissionError){
   setNotice(submissionError.message.includes("promotional_campaign_products")
    ?"Campaign product setup is missing. The administrator needs to run supabase/promotional_campaign_products_setup.sql in Supabase SQL Editor."
    :"Could not load campaign submissions: "+submissionError.message);
   setLoading(false);return;
  }
  const ids=(submissionRows??[]).map(row=>row.product_id);
  if(!ids.length){setProducts([]);setLoading(false);return;}
  const {data:productRows,error:productError}=await supabase.from("products")
   .select("id,title,description,price_scr,image_urls,category,shops(name,island)")
   .in("id",ids).eq("status","approved").or("is_archived.is.null,is_archived.eq.false");
  if(productError){setNotice("Campaign products were found, but product details could not be loaded: "+productError.message);setLoading(false);return;}
  const ordered=new Map((productRows??[]).map((p:any)=>[p.id,p]));
  setProducts(ids.map(id=>ordered.get(id)).filter(Boolean) as Product[]);
  setLoading(false);
 }
 useEffect(()=>{void load();},[campaignId]);
 return <main className="account-page">
  <div className="admin-wrap" style={{maxWidth:1180,margin:"0 auto"}}>
   <Link href="/" className="account-back"><ArrowLeft size={16}/> Back to islandXpress</Link>
   {campaign&&<section className={"campaign-slide campaign-style-"+campaign.background_style} style={{marginTop:24,minHeight:240,borderRadius:20,overflow:"hidden",position:"relative"}}>
    {campaign.image_url&&<img className="campaign-background-image" src={campaign.image_url} alt=""/>}
    <div className="campaign-slide-copy"><span className="campaign-eyebrow">{campaign.eyebrow}</span><h1>{campaign.title}</h1>{campaign.subtitle&&<h2>{campaign.subtitle}</h2>}{campaign.description&&<p>{campaign.description}</p>}</div>
   </section>}
   <section className="section" style={{paddingTop:32}}>
    <div className="section-head"><div><div className="eyebrow">SPECIAL OFFERS</div><h2>{campaign?.title??"Explore offers"}</h2><p>Products selected by Seychelles sellers for this campaign.</p></div><span>{products.length} offer{products.length===1?"":"s"}</span></div>
    {loading?<div className="empty">Loading campaign products…</div>:notice?<div className="empty"><p>{notice}</p><button className="admin-refresh" onClick={()=>void load()}><RefreshCw size={15}/> Try again</button></div>:products.length?<div className="product-grid">{products.map(p=><article className="product" key={p.id}>
     <Link href={"/product/"+p.id} className="product-image-link">{p.image_urls?.[0]?<img className="market-product-image" src={p.image_urls[0]} alt={p.title}/>:<span className="product-emoji">📦</span>}</Link>
     <div className="product-info"><small>{p.category}</small><Link href={"/product/"+p.id} className="product-title-link"><h3>{p.title}</h3></Link><div className="seller">{p.shops?.name??"Seychelles seller"} · {p.shops?.island??"Seychelles"}</div><div className="price">SCR {Number(p.price_scr).toLocaleString()}</div><Link href={"/product/"+p.id} className="campaign-cta">View product <ShoppingBag size={15}/></Link></div>
    </article>)}</div>:<div className="empty">No approved products have been submitted to this campaign yet. Sellers can add products from Seller Centre → Campaigns.</div>}
   </section>
  </div>
 </main>;
}
