"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShoppingBag, MapPin, Truck, Store, ChevronLeft, ChevronRight, Package, Star } from "lucide-react";
import { supabase } from "../../../lib/supabase";

type Variant = {id:string;label:string;price_scr:number;stock_quantity:number;attributes:Record<string,unknown>};
type ProductReview = { id:string; rating:number; title:string|null; body:string; created_at:string };
type ProductDetails = {
  id: string; title: string; description: string | null; category: string;
  price_scr: number; stock_quantity: number; image_urls: string[]; shipping_days_min: number | null; shipping_days_max: number | null;
  shops: { id: string; name: string; island: string | null; description: string | null; logo_url: string | null } | null;
};

export default function ProductDetailsPage() {
  const params = useParams();
  const productId = String(params.id ?? "");
  const [product,setProduct] = useState<ProductDetails|null>(null);
  const [variants,setVariants] = useState<Variant[]>([]);
  const [selectedVariant,setSelectedVariant] = useState<Variant|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [activeImage,setActiveImage] = useState(0);
  const [notice,setNotice] = useState("");
  const [reviews,setReviews] = useState<ProductReview[]>([]);
  const [ratingSummary,setRatingSummary] = useState({average:0,count:0});

  useEffect(() => {
    let active = true;
    async function load() {
      const { data,error } = await supabase.from("products")
        .select("id,title,description,category,price_scr,stock_quantity,image_urls,shipping_days_min,shipping_days_max,shops(id,name,island,description,logo_url)")
        .eq("id",productId).eq("status","approved").or("is_archived.is.null,is_archived.eq.false").single();
      if (!active) return;
      if (error || !data) setError("This product could not be found or is no longer available.");
      else { setProduct(data as unknown as ProductDetails); const {data: variantRows}=await supabase.from("product_variants").select("id,label,price_scr,stock_quantity,attributes").eq("product_id",productId).eq("is_active",true).order("created_at"); const available=(variantRows??[]) as Variant[];setVariants(available);setSelectedVariant(available.find(v=>v.stock_quantity>0)??available[0]??null); const {data: reviewRows}=await supabase.from("product_reviews").select("id,rating,title,body,created_at").eq("product_id",productId).eq("status","approved").order("created_at",{ascending:false}); const rows=(reviewRows??[]) as ProductReview[]; setReviews(rows); setRatingSummary({average:rows.length?rows.reduce((sum,r)=>sum+r.rating,0)/rows.length:0,count:rows.length}); }
      setLoading(false);
    }
    if (productId) load();
    return () => { active = false; };
  },[productId]);

  function addToCart() {
    if (!product) return;
    const available=variants.length?selectedVariant?.stock_quantity:product.stock_quantity;
    if (!available || (variants.length&&!selectedVariant)) { setNotice("Please select an available variation."); return; }
    try {
      const saved=JSON.parse(localStorage.getItem("island-express-cart")||"[]");
      const cart=Array.isArray(saved)?saved:[];
      const line={productId:product.id,variantId:selectedVariant?.id??null,variantLabel:selectedVariant?.label??null};
      localStorage.setItem("island-express-cart",JSON.stringify([...cart,line]));
      setNotice("Added to your cart");
    } catch {
      localStorage.setItem("island-express-cart",JSON.stringify([{productId:product.id,variantId:selectedVariant?.id??null,variantLabel:selectedVariant?.label??null}]));
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
          <div className="product-detail-rating"><span className="rating-stars"><Star size={17} fill={ratingSummary.count?"currentColor":"none"}/></span>{ratingSummary.count?<><b>{ratingSummary.average.toFixed(1)} / 5</b><a href="#reviews">{ratingSummary.count} customer {ratingSummary.count===1?"review":"reviews"}</a></>:<span>No reviews yet</span>}</div>
          {variants.length>0&&<div className="product-variation-picker"><h2>Choose an option</h2><div className="seller-form-row">{variants.map(v=><button type="button" key={v.id} className={selectedVariant?.id===v.id?"primary":"secondary"} disabled={v.stock_quantity<=0} onClick={()=>setSelectedVariant(v)}>{v.label}</button>)}</div></div>}
          <div className="product-detail-price">SCR {Number(selectedVariant?.price_scr??product.price_scr).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div className="product-detail-stock">{(variants.length?selectedVariant?.stock_quantity??0:product.stock_quantity)>0?(variants.length?selectedVariant?.stock_quantity:product.stock_quantity)+" available":"Currently out of stock"}</div>
          <button className="primary product-detail-add" type="button" onClick={addToCart} disabled={variants.length?(!selectedVariant||selectedVariant.stock_quantity<=0):product.stock_quantity<=0}><ShoppingBag size={17}/> Add to cart</button>
          {notice&&<div className="product-detail-notice" role="status">{notice}</div>}
          <div className="product-detail-section"><h2>Product details</h2><p>{product.description?.trim()||"The seller has not added a product description yet."}</p><div className="product-detail-meta"><span>Category</span><b>{product.category}</b></div><div className="product-detail-meta"><span>Availability</span><b>{product.stock_quantity>0?"In stock":"Out of stock"}</b></div></div>
          <div className="product-shipping-card"><div className="product-shipping-icon"><Truck size={20}/></div><div><b>Estimated shipping time</b><strong className="product-shipping-range">{product.shipping_days_min != null && product.shipping_days_max != null ? (product.shipping_days_min === product.shipping_days_max ? product.shipping_days_min + " days" : product.shipping_days_min + "–" + product.shipping_days_max + " days") : "To be confirmed"}</strong><p>{product.shipping_days_min != null && product.shipping_days_max != null ? "Seller's estimated delivery time after dispatch. Actual timing may vary by destination island and delivery address." : "The seller will confirm the estimated delivery time after your order, based on your island and delivery address."}</p><small>Delivery estimate provided by the seller.</small></div></div>
        </section>
      </div>
      <section className="product-reviews-section" id="reviews"><div className="product-reviews-heading"><div><h2>Customer reviews</h2><p>{ratingSummary.count?`${ratingSummary.count} verified-buyer ${ratingSummary.count===1?"review":"reviews"}`:"Be the first to review this product after your purchase."}</p></div>{ratingSummary.count>0&&<strong><Star size={17} fill="currentColor"/>{ratingSummary.average.toFixed(1)} / 5</strong>}</div>{reviews.length===0?<div className="product-reviews-empty">No approved reviews yet.</div>:<div className="product-reviews-list">{reviews.map(review=><article className="product-review" key={review.id}><div className="product-review-top"><div className="review-stars">{Array.from({length:5},(_,i)=><Star key={i} size={15} fill={i<review.rating?"currentColor":"none"}/>)}</div><small>{new Date(review.created_at).toLocaleDateString()}</small></div>{review.title&&<h3>{review.title}</h3>}<p>{review.body}</p><span>Verified buyer</span></article>)}</div>}</section>
      <Link href={product.shops?.id ? "/shop/"+product.shops.id : "#"} className="product-shop-card product-shop-card-link" aria-label={"View "+(product.shops?.name||"seller")+" shop"}><div className="product-shop-avatar">{product.shops?.logo_url?<img src={product.shops.logo_url} alt=""/>:<Store size={25}/>}</div><div className="product-shop-copy"><small>Sold by</small><h2>{product.shops?.name||"Island Express seller"}</h2><p><MapPin size={14}/>{product.shops?.island||"Seychelles"}</p>{product.shops?.description&&<span>{product.shops.description}</span>}<strong className="product-shop-visit">Visit shop <span>→</span></strong></div></Link>
    </div>
    {notice&&<div className="toast">{notice}</div>}
  </main>;
}
