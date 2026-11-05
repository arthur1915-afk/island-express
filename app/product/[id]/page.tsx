"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag, MapPin, Truck, Store, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { supabase } from "../../../lib/supabase";

type ProductDetails = {
  id: string; title: string; description: string | null; category: string;
  price_scr: number; stock_quantity: number; image_urls: string[];
  shops: { name: string; island: string | null; description: string | null; logo_url: string | null } | null;
};

export default function ProductDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const productId = String(params.id ?? "");
  const [product,setProduct] = useState<ProductDetails|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [activeImage,setActiveImage] = useState(0);
  const [notice,setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const { data,error } = await supabase.from("products")
        .select("id,title,description,category,price_scr,stock_quantity,image_urls,shops(name,island,description,logo_url)")
        .eq("id",productId).eq("status","approved").single();
      if (!active) return;
      if (error || !data) setError("This product could not be found or is no longer available.");
      else setProduct(data as unknown as ProductDetails);
      setLoading(false);
    }
    if (productId) load();
    return () => { active = false; };
  },[productId]);

  function addToCart() {
    if (!product) return;
    try {
      const saved = JSON.parse(localStorage.getItem("island-express-cart") || "[]");
      localStorage.setItem("island-express-cart",JSON.stringify([...saved,product.id]));
      setNotice("Added to your cart");
    } catch {
      localStorage.setItem("island-express-cart",JSON.stringify([product.id]));
      setNotice("Added to your cart");
    }
  }

  const images = product?.image_urls?.length ? product.image_urls : [];
  const currentImage = images[activeImage];

  if (loading) return <main className="product-detail-page"><div className="product-detail-loading">Loading product…</div></main>;
  if (error || !product) return <main className="product-detail-page"><div className="product-detail-loading"><Package size={34}/><h1>Product unavailable</h1><p>{error}</p><Link href="/" className="primary">Back to marketplace</Link></div></main>;

  return <main className="product-detail-page">
    <header className="product-detail-header"><Link href="/" className="account-back"><ArrowLeft size={16}/> Marketplace</Link><Link href="/" className="account-brand">island<span>express</span></Link><Link href="/cart" className="product-detail-cart"><ShoppingBag size={17}/> Cart</Link></header>
    <div className="product-detail-wrap">
      <div className="product-detail-breadcrumb"><Link href="/">Home</Link> / {product.category} / {product.title}</div>
      <div className="product-detail-layout">
        <section className="product-gallery">
          <div className="product-gallery-main">
            {currentImage ? <img src={currentImage} alt={product.title+" photo "+(activeImage+1)}/> : <div className="product-gallery-empty"><Package size={54}/><span>No product photos</span></div>}
            {images.length>1&&<><button type="button" className="product-gallery-arrow prev" onClick={()=>setActiveImage(i=>(i-1+images.length)%images.length)} aria-label="Previous photo"><ChevronLeft/></button><button type="button" className="product-gallery-arrow next" onClick={()=>setActiveImage(i=>(i+1)%images.length)} aria-label="Next photo"><ChevronRight/></button><span className="product-gallery-counter">{activeImage+1} / {images.length}</span></>}
          </div>
          {images.length>0&&<div className="product-gallery-thumbs">{images.map((url,index)=><button type="button" key={url+index} className={activeImage===index?"active":""} onClick={()=>setActiveImage(index)} aria-label={"View photo "+(index+1)}><img src={url} alt={product.title+" thumbnail "+(index+1)}/></button>)}</div>}
        </section>
        <section className="product-detail-info">
          <div className="eyebrow">{product.category}</div>
          <h1>{product.title}</h1>
          <div className="product-detail-price">SCR {Number(product.price_scr).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div className="product-detail-stock">{product.stock_quantity>0?product.stock_quantity+" available":"Currently out of stock"}</div>
          <button className="primary product-detail-add" type="button" onClick={addToCart} disabled={product.stock_quantity<=0}><ShoppingBag size={17}/> Add to cart</button>
          {notice&&<div className="product-detail-notice" role="status">{notice}</div>}
          <div className="product-detail-section"><h2>Product details</h2><p>{product.description?.trim()||"The seller has not added a product description yet."}</p><div className="product-detail-meta"><span>Category</span><b>{product.category}</b></div><div className="product-detail-meta"><span>Availability</span><b>{product.stock_quantity>0?"In stock":"Out of stock"}</b></div></div>
          <div className="product-shipping-card"><div className="product-shipping-icon"><Truck size={20}/></div><div><b>Shipping & delivery</b><p>Delivery is available across Seychelles. The seller will confirm the estimated delivery date based on your island and delivery address after an order is placed. Please check the shipping details in your order updates.</p><small>Delivery timing may vary by island and seller.</small></div></div>
        </section>
      </div>
      <section className="product-shop-card"><div className="product-shop-avatar">{product.shops?.logo_url?<img src={product.shops.logo_url} alt=""/>:<Store size={25}/>}</div><div className="product-shop-copy"><small>Sold by</small><h2>{product.shops?.name||"Island Express seller"}</h2><p><MapPin size={14}/>{product.shops?.island||"Seychelles"}</p>{product.shops?.description&&<span>{product.shops.description}</span>}</div></section>
    </div>
    {notice&&<div className="toast">{notice}</div>}
  </main>;
}
