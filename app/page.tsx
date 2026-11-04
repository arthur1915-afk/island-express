"use client";

import { useMemo, useState } from "react";
import { Search, ShoppingBag, MapPin, Menu, Heart, ShieldCheck, Truck, ChevronRight, UserRound, Plus } from "lucide-react";
import { useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Product = { id: string; title: string; category: string; price_scr: number; description: string | null; image_urls: string[]; created_at?: string; shops: { name: string; island: string | null } | null };

const categories = ["All", "Electronics", "Fashion", "Home & Living", "Beauty", "Sports", "Automotive", "Food & Groceries"];

export default function Home() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [island, setIsland] = useState("All islands");
  const [sort, setSort] = useState("newest");
  const [cart, setCart] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try { setCart(JSON.parse(localStorage.getItem("island-express-cart") || "[]")); } catch { setCart([]); }
  }, []);
  useEffect(() => { localStorage.setItem("island-express-cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    let active = true;
    supabase.from("products").select("id,title,category,price_scr,description,image_urls,created_at,shops(name,island)").eq("status","approved").order("created_at",{ascending:false}).then(({data,error}) => {
      if (!active) return;
      if (error) setNotice("Could not load marketplace listings.");
      setProducts((data ?? []) as unknown as Product[]);
      setProductsLoading(false);
    });
    return () => { active = false; };
  }, []);
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
      <div className="search"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products, shops and more..."/><button>Search</button></div>
      <div className="head-actions"><a className="iconbtn" aria-label="Account" href="/account"><UserRound/></a><Link className="cart" href="/cart"><ShoppingBag size={19}/> Cart <b>{cart.length}</b></Link><button className="mobilemenu" aria-label="Menu"><Menu/></button></div>
    </header>
    <nav className="nav"><div className="wrap navinner"><span className="navlabel"><Menu size={16}/> Categories</span>{categories.slice(1,6).map(c=><button key={c} onClick={()=>setCategory(c)}>{c}</button>)}<a href="#sell">Sell on Island Express <ChevronRight size={14}/></a></div></nav>
    <section className="hero wrap"><div className="hero-copy"><div className="eyebrow"><span/> THE SEYCHELLES MARKETPLACE</div><h1>Everything you need.<br/><em>Right here on the islands.</em></h1><p>Discover local shops, find great deals and support sellers across Seychelles — all in one place.</p><div className="hero-buttons"><a className="primary" href="#products">Start shopping <ChevronRight size={17}/></a><a className="secondary" href="#sell">Open your shop</a></div><div className="hero-trust"><span><ShieldCheck size={16}/> Safer shopping</span><span><Truck size={16}/> Island-wide sellers</span></div></div><div className="hero-art"><div className="sun"></div><div className="island island-back"></div><div className="island island-front"></div><div className="bag">🛍️</div><div className="float-card card-one">🌴 <b>Made for the islands</b></div><div className="float-card card-two">📦 <b>Shop local</b></div></div></section>
    <section className="benefits wrap"><div><span className="benefit-icon">🏝️</span><span><b>Local marketplace</b><small>Discover Seychelles sellers</small></span></div><div><span className="benefit-icon">🛡️</span><span><b>Product checks</b><small>Listings reviewed for safety</small></span></div><div><span className="benefit-icon">💬</span><span><b>Direct with sellers</b><small>Connect with local shops</small></span></div><div><span className="benefit-icon">💰</span><span><b>Prices in SCR</b><small>Shop in local currency</small></span></div></section>
    <section className="section wrap" id="products"><div className="section-head"><div><div className="eyebrow">FIND YOUR NEXT FAVOURITE</div><h2>Explore products</h2><p>Great finds from shops around Seychelles.</p></div><a href="#products" onClick={()=>setCategory("All")}>View all <ChevronRight size={16}/></a></div><div className="chips">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="market-filters"><label>Island<select value={island} onChange={e=>setIsland(e.target.value)}><option>All islands</option><option>Mahé</option><option>Praslin</option><option>La Digue</option></select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Product name</option></select></label><span>{filtered.length} product{filtered.length===1?"":"s"} found</span></div><div className="product-grid">{filtered.map(p=><article className="product" key={p.id}><div className="product-image">{p.image_urls?.[0]?<img className="market-product-image" src={p.image_urls[0]} alt={p.title}/>:<span className="product-emoji">📦</span>}<button className="heart" aria-label="Save product"><Heart size={17}/></button></div><div className="product-info"><small>{p.category}</small><h3>{p.title}</h3><div className="seller">{p.shops?.name ?? "Island Express seller"} · {p.shops?.island ?? "Seychelles"}</div><div className="price">SCR {Number(p.price_scr).toLocaleString()}</div><button className="add" onClick={()=>addToCart(p.id)}><Plus size={15}/> Add to cart</button></div></article>)}</div>{productsLoading?<div className="empty">Loading approved products…</div>:filtered.length===0&&<div className="empty">{query||category!=="All"?"No matching products found. Try another search or category.":"No approved products yet. Check back soon for new listings from Seychelles sellers."}</div>}</section>
    <section className="seller-cta wrap" id="sell"><div><div className="eyebrow">YOUR SHOP. YOUR BUSINESS.</div><h2>Have something to sell?</h2><p>Open your own Island Express shop and reach customers across Seychelles. Seller registration is open to everyone.</p><a className="primary" href="/account">Become a seller <ChevronRight size={17}/></a></div><div className="seller-illustration">🏪<span>✨</span></div></section>
    <footer><div className="wrap footer-inner"><a className="brand footer-brand" href="#"><span className="brandmark"><ShoppingBag size={21}/></span><span>island<span className="brand-orange">express</span><small>SHOP LOCAL. DISCOVER MORE.</small></span></a><span>Made for Seychelles <b>♥</b></span><span>© {new Date().getFullYear()} Island Express</span><Link href="/admin/login" className="footer-admin-link">Admin</Link></div></footer>
    {notice&&<div className="toast">{notice}</div>}<div className="prototype-note">EARLY MARKETPLACE PREVIEW · Product listings are reviewed before publication · Checkout setup in progress</div>
  </main>;
}
