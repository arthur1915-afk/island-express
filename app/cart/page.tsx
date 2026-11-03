"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Product = { id: string; title: string; price_scr: number; image_urls: string[]; shops: { name: string } | null };

export default function CartPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    try { setIds(JSON.parse(localStorage.getItem("island-express-cart") || "[]")); } catch { setIds([]); }
  }, []);
  useEffect(() => {
    localStorage.setItem("island-express-cart", JSON.stringify(ids));
    const unique = [...new Set(ids)];
    if (!unique.length) { setProducts([]); setLoading(false); return; }
    supabase.from("products").select("id,title,price_scr,image_urls,shops(name)").in("id", unique).eq("status","approved")
      .then(({data}) => { setProducts((data ?? []) as unknown as Product[]); setLoading(false); });
  }, [ids]);
  const quantities = useMemo(() => ids.reduce<Record<string,number>>((a,id) => { a[id]=(a[id]||0)+1; return a; },{}),[ids]);
  const total = products.reduce((sum,p)=>sum+(Number(p.price_scr)||0)*(quantities[p.id]||0),0);
  function change(id:string,delta:number) {
    setIds(old => delta > 0 ? [...old,id] : old.filter((x,i)=>x!==id || old.indexOf(id)!==i));
  }
  function remove(id:string) { setIds(old=>old.filter(x=>x!==id)); }
  return <main className="cart-page">
    <header className="cart-page-header"><Link href="/" className="account-brand">island<span>express</span></Link><span>YOUR SHOPPING CART</span></header>
    <div className="cart-page-wrap">
      <Link href="/" className="cart-back"><ArrowLeft size={16}/> Continue shopping</Link>
      <h1>Your cart</h1><p className="cart-intro">Review your items before proceeding to checkout.</p>
      {loading ? <div className="cart-empty">Loading your cart…</div> : products.length === 0 ? <div className="cart-empty"><ShoppingBag size={38}/><h2>Your cart is empty</h2><p>Find something you love from local Seychelles sellers.</p><Link className="primary" href="/">Explore products</Link></div> :
      <div className="cart-layout"><section className="cart-items">{products.map(p=><article className="cart-item" key={p.id}><div className="cart-thumb">{p.image_urls?.[0]?<img src={p.image_urls[0]} alt={p.title}/>:<span>📦</span>}</div><div className="cart-item-info"><h3>{p.title}</h3><small>{p.shops?.name ?? "Island Express seller"}</small><b>SCR {Number(p.price_scr).toLocaleString()}</b><div className="cart-quantity"><button onClick={()=>change(p.id,-1)} aria-label="Decrease quantity"><Minus size={14}/></button><span>{quantities[p.id]}</span><button onClick={()=>change(p.id,1)} aria-label="Increase quantity"><Plus size={14}/></button><button className="cart-remove" onClick={()=>remove(p.id)}><Trash2 size={14}/> Remove</button></div></div><strong>SCR {(Number(p.price_scr)*quantities[p.id]).toLocaleString()}</strong></article>)}</section>
      <aside className="cart-summary"><h2>Order summary</h2><div><span>Subtotal</span><b>SCR {total.toLocaleString()}</b></div><div><span>Delivery</span><span>Calculated by seller</span></div><hr/><div className="cart-total"><span>Total</span><b>SCR {total.toLocaleString()}</b></div><Link className="primary cart-checkout" href="/checkout">Proceed to checkout</Link><small>Payment and delivery arrangements will be confirmed during checkout.</small></aside></div>}
    </div>
  </main>;
}
