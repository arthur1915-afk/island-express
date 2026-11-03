"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, ImagePlus, Package, Store } from "lucide-react";

type Shop = { id: string; name: string; island: string | null };
type Product = { id: string; title: string; price_scr: number; stock_quantity: number; status: string; created_at: string; image_urls: string[] };

const categories = ["Electronics","Fashion","Home & Living","Beauty","Sports","Automotive","Food & Groceries","Other"];

export default function SellerDashboard() {
  const router = useRouter();
  const [shop,setShop] = useState<Shop|null>(null);
  const [products,setProducts] = useState<Product[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [category,setCategory] = useState(categories[0]);
  const [price,setPrice] = useState("");
  const [stock,setStock] = useState("1");
  const [image,setImage] = useState<File|null>(null);

  async function refresh() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id",user.id).single();
    if (profile?.role !== "seller") { router.replace("/account"); return; }
    const { data: shops, error } = await supabase.from("shops").select("id,name,island").eq("owner_id",user.id).limit(1);
    if (error || !shops?.length) { setMessage("We couldn't find your shop. Please create it from your account page."); setLoading(false); return; }
    setShop(shops[0] as Shop);
    const { data: rows, error: productsError } = await supabase.from("products").select("id,title,price_scr,stock_quantity,status,created_at,image_urls").eq("shop_id",shops[0].id).order("created_at",{ascending:false});
    if (productsError) setMessage(productsError.message);
    setProducts((rows ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(()=>{ refresh(); },[]);

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shop) return;
    const parsedPrice = Number(price), parsedStock = Number(stock);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      setMessage("Enter a valid price and whole-number stock quantity."); return;
    }
    setBusy(true); setMessage("");
    try {
      let imageUrls: string[] = [];
      if (image) {
        const extension = image.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = shop.id + "/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path,image,{contentType:image.type,upsert:false});
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        imageUrls = [data.publicUrl];
      }
      const { error } = await supabase.from("products").insert({
        shop_id:shop.id,title:title.trim(),description:description.trim(),category,
        price_scr:parsedPrice,stock_quantity:parsedStock,image_urls:imageUrls
      });
      if (error) throw error;
      setTitle("");setDescription("");setPrice("");setStock("1");setImage(null);
      setMessage("Product submitted! It is pending review and will not appear publicly until approved.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't submit the product.");
    } finally { setBusy(false); }
  }

  if (loading) return <main className="account-page"><section className="account-card">Loading your seller dashboard…</section></main>;

  return <main className="seller-dashboard">
    <header className="seller-dash-header"><Link href="/account" className="account-back"><ArrowLeft size={16}/> My account</Link><Link href="/" className="account-brand">island<span>express</span></Link></header>
    <div className="seller-dash-wrap">
      <div className="seller-dash-title"><div><div className="eyebrow">SELLER CENTRE</div><h1>{shop?.name || "Your shop"}</h1><p><Store size={15}/> {shop?.island || "Seychelles"} · Manage your listings</p></div><div className="seller-count"><Package size={19}/><b>{products.length}</b><span>Products</span></div></div>
      <div className="seller-dash-grid">
        <section className="seller-dash-panel"><h2>Add a product</h2><p>New listings are checked before they become visible to shoppers.</p>
          <form className="account-form" onSubmit={addProduct}>
            <label>Product name<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Mountain bike"/></label>
            <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the product, condition and details"/></label>
            <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
            <div className="seller-form-row"><label>Price (SCR)<input required type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></label><label>Stock quantity<input required type="number" min="0" step="1" value={stock} onChange={e=>setStock(e.target.value)}/></label></div>
            <label className="upload-label"><ImagePlus size={18}/> Product image (JPG, PNG or WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setImage(e.target.files?.[0] ?? null)}/>{image&&<small>{image.name}</small>}</label>
            <button className="primary account-submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
          </form>
          {message&&<div className="account-message" role="status">{message}</div>}
        </section>
        <section className="seller-dash-panel"><h2>Your products</h2><p>Track the review status of your listings.</p>
          {products.length===0?<div className="seller-empty"><Package size={32}/><b>No products yet</b><span>Your submitted products will appear here.</span></div>:<div className="seller-products">{products.map(p=><article className="seller-product-row" key={p.id}><div className="seller-product-thumb">{p.image_urls?.[0]?<img src={p.image_urls[0]} alt=""/>:<Package size={22}/>}</div><div className="seller-product-detail"><b>{p.title}</b><span>SCR {Number(p.price_scr).toLocaleString()} · Stock {p.stock_quantity}</span><small className={"status-"+p.status}>{p.status.replace("_"," ")}</small></div></article>)}</div>}
        </section>
      </div>
    </div>
  </main>;
}
