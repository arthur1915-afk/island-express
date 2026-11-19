import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

type CampaignProduct = {
  product_id: string;
  products: {
    id: string; title: string; description: string | null; price_scr: number;
    image_urls: string[] | null; category: string; shops: { name: string; island: string | null } | null;
  } | null;
};

export default async function CampaignOffersPage({ params }: { params: { id: string } }) {
  const { data: campaign, error } = await supabase.from("promotional_campaigns")
    .select("id,eyebrow,title,subtitle,description,image_url,background_style,starts_at,ends_at")
    .eq("id", params.id).eq("is_active", true).lte("starts_at", new Date().toISOString())
    .or("ends_at.is.null,ends_at.gt." + new Date().toISOString()).maybeSingle();
  if (error || !campaign) notFound();

  const { data: rows } = await supabase.from("promotional_campaign_products")
    .select("product_id,products(id,title,description,price_scr,image_urls,category,shops(name,island))")
    .eq("campaign_id", campaign.id);
  const products = ((rows ?? []) as unknown as CampaignProduct[])
    .map(row => row.products).filter((p): p is NonNullable<CampaignProduct["products"]> => Boolean(p));

  return <main className="account-page">
    <div className="admin-wrap" style={{maxWidth:1180,margin:"0 auto"}}>
      <Link href="/" className="account-back"><ArrowLeft size={16}/> Back to islandXpress</Link>
      <section className={"campaign-slide campaign-style-"+campaign.background_style} style={{marginTop:24,minHeight:240,borderRadius:20,overflow:"hidden",position:"relative"}}>
        {campaign.image_url && <img className="campaign-background-image" src={campaign.image_url} alt=""/>}
        <div className="campaign-slide-copy"><span className="campaign-eyebrow">{campaign.eyebrow}</span><h1>{campaign.title}</h1>{campaign.subtitle&&<h2>{campaign.subtitle}</h2>}{campaign.description&&<p>{campaign.description}</p>}</div>
      </section>
      <section className="section" style={{paddingTop:32}}>
        <div className="section-head"><div><div className="eyebrow">SPECIAL OFFERS</div><h2>Explore offers</h2><p>Products selected by Seychelles sellers for this campaign.</p></div><span>{products.length} offer{products.length===1?"":"s"}</span></div>
        {products.length ? <div className="product-grid">{products.map(p=><article className="product" key={p.id}>
          <Link href={"/product/"+p.id} className="product-image-link">{p.image_urls?.[0]?<img className="market-product-image" src={p.image_urls[0]} alt={p.title}/>:<span className="product-emoji">📦</span>}</Link>
          <div className="product-info"><small>{p.category}</small><Link href={"/product/"+p.id} className="product-title-link"><h3>{p.title}</h3></Link><div className="seller">{p.shops?.name ?? "Seychelles seller"} · {p.shops?.island ?? "Seychelles"}</div><div className="price">SCR {Number(p.price_scr).toLocaleString()}</div><Link href={"/product/"+p.id} className="campaign-cta">View product <ShoppingBag size={15}/></Link></div>
        </article>)}</div> : <div className="empty">No products have been added to this campaign yet. Check back soon for offers from local sellers.</div>}
      </section>
    </div>
  </main>;
}
