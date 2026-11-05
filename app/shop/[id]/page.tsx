"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Package, ShoppingBag, Star } from "lucide-react";
import { supabase } from "../../../lib/supabase";

type Shop = { id:string; name:string; island:string|null; description:string|null; logo_url:string|null };
type Product = { id:string; title:string; category:string; price_scr:number; image_urls:string[]; stock_quantity:number };

export default function ShopPage() {
  const params = useParams();
  const shopId = String(params.id ?? "");
  const [shop,setShop] = useState<Shop|null>(null);
  const [products,setProducts] = useState<Product[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [{data: shopData,error: shopError},{data: productData,error: productError}] = await Promise.all([
        supabase.from("shops").select("id,name,island,description,logo_url").eq("id",shopId).eq("is_active",true).single(),
        supabase.from("products").select("id,title,category,price_scr,image_urls,stock_quantity").eq("shop_id",shopId).eq("status","approved").order("created_at",{ascending:false})
      ]);
      if (!active) return;
      if (shopError || !shopData) setError("This shop could not be found or is currently unavailable.");
      else { setShop(shopData as Shop); setProducts((productError ? [] : productData ?? []) as Product[]); }
      setLoading(false);
    }
    if (shopId) load();
    return () => { active = false; };
  },[shopId]);

  if (loading) return <main className="shop-page"><p className="shop-page-message">Loading shop…</p></main>;
  if (error || !shop) return <main className="shop-page"><div className="shop-page-message"><h1>Shop unavailable</h1><p>{error}</p><Link href="/">Back to marketplace</Link></div></main>;

  return <main className="shop-page">
    <header className="shop-page-header"><Link href="/" className="account-back"><ArrowLeft size={16}/> Marketplace</Link><Link href="/" className="account-brand">island<span>express</span></Link><Link href="/cart" className="product-detail-cart"><ShoppingBag size={17}/> Cart</Link></header>
    <div className="shop-page-wrap">
      <section className="shop-profile-banner">
        <div className="shop-profile-logo">{shop.logo_url ? <img src={shop.logo_url} alt={shop.name}/> : <span>🏬</span>}</div>
        <div><small>ISLAND EXPRESS SHOP</small><h1>{shop.name}</h1><p><MapPin size={15}/>{shop.island || "Seychelles"}</p>{shop.description&&<div className="shop-profile-description">{shop.description}</div>}</div>
      </section>
      <section className="shop-products-section">
        <div className="shop-products-heading"><div><h2>Products from {shop.name}</h2><p>Browse items available from this shop only.</p></div><strong>{products.length} item{products.length===1?"":"s"}</strong></div>
        {products.length===0 ? <div className="shop-empty"><Package size={30}/><p>This shop has no approved products available right now.</p></div> :
          <div className="product-grid">{products.map(product=><article className="product" key={product.id}>
            <Link href={"/product/"+product.id} className="shop-product-image">{product.image_urls?.[0]?<img src={product.image_urls[0]} alt={product.title}/>:<span>📦</span>}</Link>
            <div className="product-info"><small>{product.category}</small><Link href={"/product/"+product.id} className="product-title-link"><h3>{product.title}</h3></Link><div className="price">SCR {Number(product.price_scr).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div><span className="shop-stock-label">{product.stock_quantity>0?product.stock_quantity+" available":"Out of stock"}</span></div>
          </article>)}</div>
        }
      </section>
    </div>
  </main>;
}
