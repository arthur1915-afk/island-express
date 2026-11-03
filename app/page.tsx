"use client";

import { useMemo, useState } from "react";
import { Search, ShoppingBag, MapPin, Menu, Heart, ShieldCheck, Truck, ChevronRight, UserRound, Plus } from "lucide-react";

const products = [
  { id: 1, name: "Wireless Bluetooth Headphones", category: "Electronics", price: 850, old: 990, seller: "Tech Island", place: "Mahé", emoji: "🎧", tag: "Popular" },
  { id: 2, name: "Handwoven Island Basket", category: "Home & Living", price: 320, old: null, seller: "Creole Craft Co.", place: "Praslin", emoji: "🧺", tag: "Local find" },
  { id: 3, name: "Everyday Running Shoes", category: "Fashion", price: 1250, old: 1490, seller: "Seychelles Style", place: "Mahé", emoji: "👟", tag: "Sale" },
  { id: 4, name: "Stainless Steel Water Bottle", category: "Sports", price: 280, old: null, seller: "Active Life", place: "Mahé", emoji: "🥤", tag: "" },
  { id: 5, name: "Table Lamp", category: "Home & Living", price: 640, old: 720, seller: "Island Home", place: "La Digue", emoji: "💡", tag: "" },
  { id: 6, name: "Skincare Gift Set", category: "Beauty", price: 540, old: null, seller: "Glow Seychelles", place: "Mahé", emoji: "🧴", tag: "New" },
  { id: 7, name: "Football Training Ball", category: "Sports", price: 490, old: null, seller: "Active Life", place: "Praslin", emoji: "⚽", tag: "" },
  { id: 8, name: "Compact Bluetooth Speaker", category: "Electronics", price: 720, old: 850, seller: "Tech Island", place: "Mahé", emoji: "🔊", tag: "Popular" }
];
const categories = ["All", "Electronics", "Fashion", "Home & Living", "Beauty", "Sports", "Automotive", "Food & Groceries"];

export default function Home() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => products.filter(p =>
    (category === "All" || p.category === category) &&
    (p.name.toLowerCase().includes(query.toLowerCase()) || p.seller.toLowerCase().includes(query.toLowerCase()))
  ), [category, query]);
  function addToCart(id: number) { setCart(old => [...old, id]); setNotice("Added to your demo cart"); window.setTimeout(() => setNotice(""), 1800); }

  return <main>
    <div className="topline"><span><MapPin size={13}/> Shopping across Seychelles</span><span>SCR · Seychelles Rupee</span></div>
    <header className="header wrap">
      <a className="brand" href="#"><span className="brandmark"><ShoppingBag size={23}/></span><span>island<span className="brand-orange">express</span><small>SHOP LOCAL. DISCOVER MORE.</small></span></a>
      <div className="search"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products, shops and more..."/><button>Search</button></div>
      <div className="head-actions"><a className="iconbtn" aria-label="Account" href="/account"><UserRound/></a><button className="cart" onClick={()=>setNotice("Your demo cart has "+cart.length+" item(s). Checkout is coming soon.")}><ShoppingBag size={19}/> Cart <b>{cart.length}</b></button><button className="mobilemenu" aria-label="Menu"><Menu/></button></div>
    </header>
    <nav className="nav"><div className="wrap navinner"><span className="navlabel"><Menu size={16}/> Categories</span>{categories.slice(1,6).map(c=><button key={c} onClick={()=>setCategory(c)}>{c}</button>)}<a href="#sell">Sell on Island Express <ChevronRight size={14}/></a></div></nav>
    <section className="hero wrap"><div className="hero-copy"><div className="eyebrow"><span/> THE SEYCHELLES MARKETPLACE</div><h1>Everything you need.<br/><em>Right here on the islands.</em></h1><p>Discover local shops, find great deals and support sellers across Seychelles — all in one place.</p><div className="hero-buttons"><a className="primary" href="#products">Start shopping <ChevronRight size={17}/></a><a className="secondary" href="#sell">Open your shop</a></div><div className="hero-trust"><span><ShieldCheck size={16}/> Safer shopping</span><span><Truck size={16}/> Island-wide sellers</span></div></div><div className="hero-art"><div className="sun"></div><div className="island island-back"></div><div className="island island-front"></div><div className="bag">🛍️</div><div className="float-card card-one">🌴 <b>Made for the islands</b></div><div className="float-card card-two">📦 <b>Shop local</b></div></div></section>
    <section className="benefits wrap"><div><span className="benefit-icon">🏝️</span><span><b>Local marketplace</b><small>Discover Seychelles sellers</small></span></div><div><span className="benefit-icon">🛡️</span><span><b>Product checks</b><small>Listings reviewed for safety</small></span></div><div><span className="benefit-icon">💬</span><span><b>Direct with sellers</b><small>Connect with local shops</small></span></div><div><span className="benefit-icon">💰</span><span><b>Prices in SCR</b><small>Shop in local currency</small></span></div></section>
    <section className="section wrap" id="products"><div className="section-head"><div><div className="eyebrow">FIND YOUR NEXT FAVOURITE</div><h2>Explore products</h2><p>Great finds from shops around Seychelles.</p></div><a href="#products" onClick={()=>setCategory("All")}>View all <ChevronRight size={16}/></a></div><div className="chips">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="product-grid">{filtered.map(p=><article className="product" key={p.id}><div className="product-image"><span className="product-emoji">{p.emoji}</span>{p.tag&&<span className="tag">{p.tag}</span>}<button className="heart" aria-label="Save product"><Heart size={17}/></button></div><div className="product-info"><small>{p.category}</small><h3>{p.name}</h3><div className="seller">{p.seller} · {p.place}</div><div className="price">SCR {p.price.toLocaleString()} {p.old&&<del>SCR {p.old.toLocaleString()}</del>}</div><button className="add" onClick={()=>addToCart(p.id)}><Plus size={15}/> Add to cart</button></div></article>)}</div>{filtered.length===0&&<div className="empty">No products found. Try another search or category.</div>}</section>
    <section className="seller-cta wrap" id="sell"><div><div className="eyebrow">YOUR SHOP. YOUR BUSINESS.</div><h2>Have something to sell?</h2><p>Open your own Island Express shop and reach customers across Seychelles. Seller registration is open to everyone.</p><a className="primary" href="/account">Become a seller <ChevronRight size={17}/></a></div><div className="seller-illustration">🏪<span>✨</span></div></section>
    <footer><div className="wrap footer-inner"><a className="brand footer-brand" href="#"><span className="brandmark"><ShoppingBag size={21}/></span><span>island<span className="brand-orange">express</span><small>SHOP LOCAL. DISCOVER MORE.</small></span></a><span>Made for Seychelles <b>♥</b></span><span>© {new Date().getFullYear()} Island Express</span></div></footer>
    {notice&&<div className="toast">{notice}</div>}<div className="prototype-note">EARLY MARKETPLACE PREVIEW · Sample products and demo cart · Payments and AI moderation are not connected yet</div>
  </main>;
}
