"use client";

import { useMemo, useState } from "react";
import { Search, ShoppingBag, MapPin, Menu, Heart, ShieldCheck, Truck, ChevronRight, UserRound, Plus, Star, Bell, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Product = { id: string; title: string; category: string; price_scr: number; description: string | null; image_urls: string[]; created_at?: string; shops: { name: string; island: string | null } | null };
type RatingSummary = { average: number; count: number };
type Campaign = { id:string; eyebrow:string; title:string; subtitle:string|null; description:string|null; image_url:string|null; cta_label:string; cta_url:string; background_style:string };

const categories = ["All", "Electronics", "Fashion", "Home & Living", "Beauty", "Sports", "Automotive", "Food & Groceries"];

export default function Home() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [island, setIsland] = useState("All islands");
  const [sort, setSort] = useState("newest");
  const [cart, setCart] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ratings, setRatings] = useState<Record<string, RatingSummary>>({});
  const [productsLoading, setProductsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignIndex, setCampaignIndex] = useState(0);
  const [campaignPaused, setCampaignPaused] = useState(false);
  useEffect(() => {
    try { setCart(JSON.parse(localStorage.getItem("island-express-cart") || "[]")); } catch { setCart([]); }
  }, []);
  useEffect(() => { localStorage.setItem("island-express-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) { setFavourites([]); setUnreadNotifications(0); return; }
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", id).is("read_at", null);
      if (active) setUnreadNotifications(count ?? 0);
      const { data: rows } = await supabase.from("wishlists").select("product_id").eq("user_id", id);
      if (active) setFavourites((rows ?? []).map(row => row.product_id));
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const id = session?.user?.id ?? null;
      setUserId(id);
      if (!id) { setFavourites([]); setUnreadNotifications(0); return; }
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", id).is("read_at", null);
      setUnreadNotifications(count ?? 0);
      const { data: rows } = await supabase.from("wishlists").select("product_id").eq("user_id", id);
      setFavourites((rows ?? []).map(row => row.product_id));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  async function toggleFavourite(id: string) {
    if (!userId) { window.location.href = "/account"; return; }
    const saved = favourites.includes(id);
    setNotice("");
    if (saved) {
      const { error } = await supabase.from("wishlists").delete().eq("user_id", userId).eq("product_id", id);
      if (error) setNotice(error.message);
      else setFavourites(old => old.filter(item => item !== id));
    } else {
      const { error } = await supabase.from("wishlists").insert({ user_id: userId, product_id: id });
      if (error) setNotice(error.message);
      else setFavourites(old => [...old, id]);
    }
    if (!saved) setNotice("Added to your favourites");
    else setNotice("Removed from your favourites");
    window.setTimeout(() => setNotice(""), 1800);
  }
  useEffect(() => {
    let active = true;
    supabase.from("products").select("id,title,category,price_scr,description,image_urls,created_at,shops(name,island)").eq("status","approved").order("created_at",{ascending:false}).then(async ({data,error}) => {
      if (!active) return;
      if (error) setNotice("Could not load marketplace listings.");
      setProducts((data ?? []) as unknown as Product[]);
      const ids = (data ?? []).map((p: any) => p.id);
      if (ids.length) { const { data: reviewRows } = await supabase.from("product_reviews").select("product_id,rating").in("product_id", ids).eq("status", "approved"); const grouped: Record<string, { total: number; count: number }> = {}; (reviewRows ?? []).forEach((r: { product_id: string; rating: number }) => { grouped[r.product_id] ??= { total: 0, count: 0 }; grouped[r.product_id].total += r.rating; grouped[r.product_id].count += 1; }); setRatings(Object.fromEntries(Object.entries(grouped).map(([id,v]) => [id,{average:v.total/v.count,count:v.count}]))); }
      setProductsLoading(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const now = new Date().toISOString();
    supabase.from("promotional_campaigns").select("id,eyebrow,title,subtitle,description,image_url,cta_label,cta_url,background_style")
      .eq("is_active", true).lte("starts_at", now)
      .or("ends_at.is.null,ends_at.gt." + now)
      .order("sort_order", { ascending: true }).then(({ data }) => {
        if (active) setCampaigns((data ?? []) as Campaign[]);
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (campaigns.length < 2 || campaignPaused) return;
    const timer = window.setInterval(() => setCampaignIndex(index => (index + 1) % campaigns.length), 6000);
    return () => window.clearInterval(timer);
  }, [campaigns.length, campaignPaused]);
  const filtered = useMemo(() => products.filter(p =>
    (category === "All" || p.category === category) &&
    (p.title.toLowerCase().includes(query.toLowerCase()) || (p.description ?? "").toLowerCase().includes(query.toLowerCase()) || (p.shops?.name ?? "").toLowerCase().includes(query.toLowerCase())) &&
    (island === "All islands" || p.shops?.island === island)
  ).sort((a,b) => sort === "price-low" ? Number(a.price_scr)-Number(b.price_scr) : sort === "price-high" ? Number(b.price_scr)-Number(a.price_scr) : sort === "name" ? a.title.localeCompare(b.title) : new Date(b.created_at ?? 0).getTime()-new Date(a.created_at ?? 0).getTime()), [category, query, island, sort, products]);
  function addToCart(id: string) { setCart(old => [...old, id]); setNotice("Added to your cart"); window.setTimeout(() => setNotice(""), 1800); }

  return <main>
    <div className="topline"><span><MapPin size={13}/> Shopping across Seychelles</span><span>SCR · Seychelles Rupee</span></div>
    <header className="header wrap">
      <a className="brand" href="#"><span className="brandmark"><ShoppingBag size={23}/></span><span>island<span className="brand-orange">express</span><small>SHOP LOCAL. DISCOVER MORE.</small></span></a>
      <form className="search" action="/search" method="get"><Search size={19}/><input name="q" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products, shops and more..." aria-label="Search products"/><button type="submit">Search</button></form>
      <div className="head-actions"><a className="iconbtn" aria-label="Account" href="/account"><UserRound/></a><Link className="iconbtn notification-bell" aria-label={"Notifications" + (unreadNotifications ? ", " + unreadNotifications + " unread" : "")} href="/notifications"><Bell/>{unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}</Link><Link className="iconbtn" aria-label="Favourites" href="/wishlist"><Heart/></Link><Link className="cart" href="/cart"><ShoppingBag size={19}/> Cart <b>{cart.length}</b></Link><button className="mobilemenu" aria-label="Menu"><Menu/></button></div>
    </header>
    <nav className="nav"><div className="wrap navinner"><span className="navlabel"><Menu size={16}/> Categories</span>{categories.slice(1,6).map(c=><button type="button" key={c} className={category===c?"nav-category-active":""} aria-pressed={category===c} onClick={()=>{setCategory(c);document.getElementById("products")?.scrollIntoView({behavior:"smooth",block:"start"});}}>{c}</button>)}<a href="#sell">Sell on Island Express <ChevronRight size={14}/></a></div></nav>
    {campaigns.length > 0 && <section className="campaign-strip wrap" aria-label="Promotional campaigns" onMouseEnter={()=>setCampaignPaused(true)} onMouseLeave={()=>setCampaignPaused(false)} onFocus={()=>setCampaignPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setCampaignPaused(false);}}>
      {campaigns.map((campaign,index)=><div key={campaign.id} className={"campaign-slide campaign-style-"+campaign.background_style+(index===campaignIndex?" is-active":"")} aria-hidden={index!==campaignIndex}>
        {campaign.image_url&&<img className="campaign-background-image" src={campaign.image_url} alt=""/>}
        <div className="campaign-slide-copy"><span className="campaign-eyebrow">{campaign.eyebrow}</span><h2>{campaign.title}</h2>{campaign.subtitle&&<h3>{campaign.subtitle}</h3>}{campaign.description&&<p>{campaign.description}</p>}<a href={campaign.cta_url} tabIndex={index===campaignIndex?0:-1} className="campaign-cta">{campaign.cta_label}<ChevronRight size={16}/></a></div>
        <div className="campaign-slide-art" aria-hidden="true"><span>{campaign.background_style==="ocean"?"🌊":campaign.background_style==="sunset"?"🌅":campaign.background_style==="market"?"🛍️":"🌴"}</span></div>
      </div>)}
      {campaigns.length>1&&<><button className="campaign-arrow campaign-prev" aria-label="Previous promotion" onClick={()=>setCampaignIndex(i=>(i-1+campaigns.length)%campaigns.length)}><ChevronLeft size={18}/></button><button className="campaign-arrow campaign-next" aria-label="Next promotion" onClick={()=>setCampaignIndex(i=>(i+1)%campaigns.length)}><ChevronRightIcon size={18}/></button><div className="campaign-dots">{campaigns.map((campaign,index)=><button key={campaign.id} aria-label={"Show promotion "+(index+1)} aria-current={index===campaignIndex} className={index===campaignIndex?"active":""} onClick={()=>setCampaignIndex(index)}/>)}</div><span className="campaign-counter">{String(campaignIndex+1).padStart(2,"0")} / {String(campaigns.length).padStart(2,"0")}</span></>}
    </section>}
    <section className="hero wrap"><div className="hero-copy"><div className="eyebrow"><span/> THE SEYCHELLES MARKETPLACE</div><h1>Everything you need.<br/><em>Right here on the islands.</em></h1><p>Discover local shops, find great deals and support sellers across Seychelles — all in one place.</p><div className="hero-buttons"><a className="primary" href="#products">Start shopping <ChevronRight size={17}/></a><a className="secondary" href="#sell">Open your shop</a></div><div className="hero-trust"><span><ShieldCheck size={16}/> Safer shopping</span><span><Truck size={16}/> Island-wide sellers</span></div></div><div className="hero-art"><div className="sun"></div><div className="island island-back"></div><div className="island island-front"></div><div className="bag">🛍️</div><div className="float-card card-one">🌴 <b>Made for the islands</b></div><div className="float-card card-two">📦 <b>Shop local</b></div></div></section>
    <section className="benefits wrap"><div><span className="benefit-icon">🏝️</span><span><b>Local marketplace</b><small>Discover Seychelles sellers</small></span></div><div><span className="benefit-icon">🛡️</span><span><b>Product checks</b><small>Listings reviewed for safety</small></span></div><div><span className="benefit-icon">💬</span><span><b>Direct with sellers</b><small>Connect with local shops</small></span></div><div><span className="benefit-icon">💰</span><span><b>Prices in SCR</b><small>Shop in local currency</small></span></div></section>
    <section className="section wrap" id="products"><div className="section-head"><div><div className="eyebrow">FIND YOUR NEXT FAVOURITE</div><h2>Explore products</h2><p>Great finds from shops around Seychelles.</p></div><a href="#products" onClick={()=>setCategory("All")}>View all <ChevronRight size={16}/></a></div><div className="chips">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="market-filters"><label>Island<select value={island} onChange={e=>setIsland(e.target.value)}><option>All islands</option><option>Mahé</option><option>Praslin</option><option>La Digue</option></select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Product name</option></select></label><span>{filtered.length} product{filtered.length===1?"":"s"} found</span></div><div className="product-grid">{filtered.map(p=><article className="product" key={p.id}><div className="product-image"><Link href={"/product/"+p.id} className="product-image-link" aria-label={"View "+p.title}>{p.image_urls?.[0]?<img className="market-product-image" src={p.image_urls[0]} alt={p.title}/>:<span className="product-emoji">📦</span>}{(p.image_urls?.length??0)>1&&<span className="product-photo-count">{p.image_urls.length} photos</span>}</Link><button className={"heart " + (favourites.includes(p.id) ? "is-favourite" : "")} aria-label={favourites.includes(p.id) ? "Remove from favourites" : "Add to favourites"} aria-pressed={favourites.includes(p.id)} onClick={()=>toggleFavourite(p.id)}><Heart size={17} fill={favourites.includes(p.id) ? "currentColor" : "none"}/></button></div><div className="product-info"><small>{p.category}</small><Link href={"/product/"+p.id} className="product-title-link"><h3>{p.title}</h3></Link><div className="seller">{p.shops?.name ?? "Island Express seller"} · {p.shops?.island ?? "Seychelles"}</div><div className="price">SCR {Number(p.price_scr).toLocaleString()}</div><Link href={"/product/"+p.id+"#reviews"} className="product-card-rating"><span className="rating-stars"><Star size={14} fill={ratings[p.id]?"currentColor":"none"}/></span>{ratings[p.id]?<><b>{ratings[p.id].average.toFixed(1)}</b><span>({ratings[p.id].count} {ratings[p.id].count===1?"review":"reviews"})</span></>:<span>No reviews yet</span>}</Link><button className="add" onClick={()=>addToCart(p.id)}><Plus size={15}/> Add to cart</button></div></article>)}</div>{productsLoading?<div className="empty">Loading approved products…</div>:filtered.length===0&&<div className="empty">{query||category!=="All"?"No matching products found. Try another search or category.":"No approved products yet. Check back soon for new listings from Seychelles sellers."}</div>}</section>
    <section className="seller-cta wrap" id="sell"><div><div className="eyebrow">YOUR SHOP. YOUR BUSINESS.</div><h2>Have something to sell?</h2><p>Open your own Island Express shop and reach customers across Seychelles. Seller registration is open to everyone.</p><a className="primary" href="/account">Become a seller <ChevronRight size={17}/></a></div><div className="seller-illustration">🏪<span>✨</span></div></section>
    <footer><div className="wrap footer-inner"><a className="brand footer-brand" href="#"><span className="brandmark"><ShoppingBag size={21}/></span><span>island<span className="brand-orange">express</span><small>SHOP LOCAL. DISCOVER MORE.</small></span></a><span>Made for Seychelles <b>♥</b></span><span>© {new Date().getFullYear()} Island Express</span><Link href="/admin/login" className="footer-admin-link">Admin</Link></div></footer>
    {notice&&<div className="toast">{notice}</div>}<div className="prototype-note">EARLY MARKETPLACE PREVIEW · Product listings are reviewed before publication · Checkout setup in progress</div>
  </main>;
}
