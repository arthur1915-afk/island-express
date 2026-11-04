"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, ImagePlus, Package, Store, ShoppingBag, BarChart3 } from "lucide-react";

type Shop = { id: string; name: string; island: string | null };
type Product = { id: string; title: string; price_scr: number; stock_quantity: number; status: string; created_at: string; image_urls: string[]; is_archived?: boolean };
type Earning = { id: string; amount_scr: number; status: "available" | "withdrawal_pending" | "paid" | "reversed"; order_id: string; released_at: string };

const categories = ["Electronics","Fashion","Home & Living","Beauty","Sports","Automotive","Food & Groceries","Other"];

export default function SellerDashboard() {
  const router = useRouter();
  const [shop,setShop] = useState<Shop|null>(null);
  const [products,setProducts] = useState<Product[]>([]);
  const [earnings,setEarnings] = useState<Earning[]>([]);
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
    const { data: earningRows, error: earningsError } = await supabase.from("seller_earnings").select("id,amount_scr,status,order_id,released_at").eq("seller_id",user.id).order("released_at",{ascending:false});
    if (earningsError) setMessage("Balance could not be loaded: " + earningsError.message);
    setEarnings((earningRows ?? []) as Earning[]);
    const { data: rows, error: productsError } = await supabase.from("products").select("id,title,price_scr,stock_quantity,status,created_at,image_urls,is_archived").eq("shop_id",shops[0].id).order("created_at",{ascending:false});
    if (productsError) setMessage(productsError.message);
    setProducts((rows ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(()=>{ refresh(); },[]);

  async function adjustStock(product: Product, direction: number) {
    const raw = window.prompt(direction > 0 ? "How many units would you like to add?" : "How many units would you like to remove?", "1");
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount <= 0) { setMessage("Enter a positive whole number."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("seller_adjust_stock", { target_product_id: product.id, stock_change: amount * direction });
    if (error) setMessage(error.message); else setMessage("Stock updated for " + product.title + ".");
    await refresh(); setBusy(false);
  }

  async function archiveProduct(product: Product) {
    if (!window.confirm("Remove " + product.title + " from the public marketplace? Existing order records will be kept.")) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("seller_archive_product", { target_product_id: product.id });
    if (error) setMessage(error.message); else setMessage("Product removed from the marketplace. Its order history is preserved.");
    await refresh(); setBusy(false);
  }

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
      <div className="seller-dash-title"><div><div className="eyebrow">SELLER CENTRE</div><h1>{shop?.name || "Your shop"}</h1><p><Store size={15}/> {shop?.island || "Seychelles"} · Manage your listings</p></div><div className="seller-title-actions"><Link href="/seller/analytics" className="seller-orders-link"><BarChart3 size={16}/> Analytics</Link><Link href="/seller/orders" className="seller-orders-link"><ShoppingBag size={16}/> Customer orders</Link><div className="seller-count"><Package size={19}/><b>{products.length}</b><span>Products</span></div></div></div>
      
      <section className="seller-balance-panel">
        <div className="seller-balance-heading"><div><div className="eyebrow">SELLER WALLET</div><h2>Your balance</h2><p>Card-payment earnings released after customers confirm delivery.</p></div><span className="seller-wallet-icon">SCR</span></div>
        <div className="seller-balance-grid">
          <div><small>Available balance</small><strong>SCR {earnings.filter(e=>e.status==="available").reduce((s,e)=>s+Number(e.amount_scr),0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Ready for withdrawal request</span></div>
          <div><small>Withdrawal pending</small><strong>SCR {earnings.filter(e=>e.status==="withdrawal_pending").reduce((s,e)=>s+Number(e.amount_scr),0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Awaiting admin processing</span></div>
          <div><small>Total paid out</small><strong>SCR {earnings.filter(e=>e.status==="paid").reduce((s,e)=>s+Number(e.amount_scr),0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Marked as paid by admin</span></div>
        </div>
        <div className="seller-balance-note">Your earnings appear here only after a card-paid order is marked delivered and the customer confirms receipt. Cash on delivery is paid directly to you and is not included.</div>
      </section>
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
          {products.length===0?<div className="seller-empty"><Package size={32}/><b>No products yet</b><span>Your submitted products will appear here.</span></div>:<div className="seller-products">{products.map(p=><article className="seller-product-row" key={p.id}><div className="seller-product-thumb">{p.image_urls?.[0]?<img src={p.image_urls[0]} alt=""/>:<Package size={22}/>}</div><div className="seller-product-detail"><b>{p.title}</b><span>SCR {Number(p.price_scr).toLocaleString()} · Stock {p.stock_quantity}</span><small className={"status-"+p.status}>{p.is_archived ? "archived" : p.status.replace("_"," ")}</small><div className="seller-product-controls">{!p.is_archived && <><button type="button" disabled={busy} onClick={()=>adjustStock(p,1)}>+ Add stock</button><button type="button" disabled={busy} onClick={()=>adjustStock(p,-1)}>− Remove stock</button><button type="button" className="seller-archive-button" disabled={busy} onClick={()=>archiveProduct(p)}>Delete listing</button></>}</div></div></article>)}</div>}
        </section>
      </div>
    </div>
  </main>;
}
