"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, ImagePlus, Package, Store, ShoppingBag, BarChart3, Ticket } from "lucide-react";

type Shop = { id: string; name: string; island: string | null; holiday_mode: boolean; description: string | null; banner_url: string | null };
type Product = { id: string; title: string; price_scr: number; stock_quantity: number; status: string; created_at: string; image_urls: string[]; is_archived?: boolean };
type Earning = { id: string; amount_scr: number; status: "available" | "withdrawal_pending" | "paid" | "reversed"; order_id: string; released_at: string };
type Withdrawal = { id:string; amount_scr:number; status:string };
type Allocation = { amount_scr:number; request_id:string };

const categories = ["Electronics","Fashion","Home & Living","Beauty","Sports","Automotive","Food & Groceries","Other"];


function LocalImagePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="seller-upload-thumb">
    {preview && <img src={preview} alt={file.name}/>}
    <button type="button" onClick={event=>{event.preventDefault();event.stopPropagation();onRemove();}} aria-label={"Remove " + file.name}>×</button>
  </div>;
}

export default function SellerDashboard() {
  const router = useRouter();
  const [shop,setShop] = useState<Shop|null>(null);
  const [products,setProducts] = useState<Product[]>([]);
  const [earnings,setEarnings] = useState<Earning[]>([]);
  const [withdrawals,setWithdrawals] = useState<Withdrawal[]>([]);
  const [allocations,setAllocations] = useState<Allocation[]>([]);
  const [withdrawalBusy,setWithdrawalBusy] = useState(false);
  const [openWithdrawal,setOpenWithdrawal] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [category,setCategory] = useState(categories[0]);
  const [price,setPrice] = useState("");
  const [stock,setStock] = useState("1");
  const [shippingMin,setShippingMin] = useState("2");
  const [shippingMax,setShippingMax] = useState("5");
  const [images,setImages] = useState<File[]>([]);
  const [shopDescription,setShopDescription] = useState("");
  const [shopBannerUrl,setShopBannerUrl] = useState("");
  const [shopfrontBusy,setShopfrontBusy] = useState(false);

  const [editingProduct,setEditingProduct] = useState<Product|null>(null);
  const [editTitle,setEditTitle] = useState("");
  const [editDescription,setEditDescription] = useState("");
  const [editCategory,setEditCategory] = useState(categories[0]);
  const [editPrice,setEditPrice] = useState("");
  const [editStock,setEditStock] = useState("1");
  const [editShippingMin,setEditShippingMin] = useState("");
  const [editShippingMax,setEditShippingMax] = useState("");
  const [keptImageUrls,setKeptImageUrls] = useState<string[]>([]);
  const [editImages,setEditImages] = useState<File[]>([]);


  async function refresh() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id",user.id).single();
    if (profile?.role !== "seller") { router.replace("/account"); return; }
    const { data: shops, error } = await supabase.from("shops").select("id,name,island,holiday_mode,description,banner_url").eq("owner_id",user.id).limit(1);
    if (error || !shops?.length) { setMessage("We couldn't find your shop. Please create it from your account page."); setLoading(false); return; }
    setShop(shops[0] as Shop);
    setShopDescription(shops[0].description ?? "");
    setShopBannerUrl(shops[0].banner_url ?? "");
    const { data: earningRows, error: earningsError } = await supabase.from("seller_earnings").select("id,amount_scr,status,order_id,released_at").eq("seller_id",user.id).order("released_at",{ascending:false});
    if (earningsError) setMessage("Balance could not be loaded: " + earningsError.message);
    setEarnings((earningRows ?? []) as Earning[]);
    const { data: withdrawalRows } = await supabase.from("seller_withdrawal_requests").select("id,amount_scr,status").eq("seller_id",user.id);
    setWithdrawals((withdrawalRows ?? []) as Withdrawal[]);
    const requestIds = (withdrawalRows ?? []).map((w:any)=>w.id);
    if (requestIds.length) {
      const { data: allocationRows } = await supabase.from("seller_withdrawal_allocations").select("amount_scr,request_id").in("request_id",requestIds);
      setAllocations((allocationRows ?? []) as Allocation[]);
    } else setAllocations([]);
    const { data: rows, error: productsError } = await supabase.from("products").select("id,title,description,category,price_scr,stock_quantity,shipping_days_min,shipping_days_max,status,created_at,image_urls,is_archived").eq("shop_id",shops[0].id).order("created_at",{ascending:false});
    if (productsError) setMessage(productsError.message);
    setProducts((rows ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(()=>{ refresh(); },[]);

  async function saveShopfront(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shop) return;
    const banner = shopBannerUrl.trim();
    if (banner && !/^https:\/\//i.test(banner)) { setMessage("Please use a secure https:// image URL for your shop banner."); return; }
    setShopfrontBusy(true); setMessage("");
    const { data, error } = await supabase.from("shops")
      .update({ description: shopDescription.trim(), banner_url: banner || null })
      .eq("id", shop.id)
      .select("id,name,island,holiday_mode,description,banner_url")
      .single();
    if (error) setMessage("Could not save your shopfront. Please run the seller shopfront SQL migration. " + error.message);
    else { setShop(data as Shop); setMessage("Your shopfront has been updated."); }
    setShopfrontBusy(false);
  }

  async function toggleHolidayMode() {
    if (!shop) return;
    const nextMode = !shop.holiday_mode;
    const confirmed = window.confirm(nextMode
      ? "Turn on Holiday Mode? Your approved products will be hidden from shoppers until you turn it off."
      : "Turn off Holiday Mode? Your approved products will become visible to shoppers again.");
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.from("shops")
      .update({ holiday_mode: nextMode })
      .eq("id", shop.id)
      .select("id,name,island,holiday_mode")
      .single();
    if (error) setMessage("Could not update Holiday Mode. Please run the seller holiday mode SQL in Supabase. " + error.message);
    else {
      setShop(data as Shop);
      setMessage(nextMode
        ? "Holiday Mode is on. Your approved products are now hidden from shoppers."
        : "Holiday Mode is off. Your approved products are visible again.");
    }
    setBusy(false);
  }

  async function requestWithdrawal() {
    const grossAvailable = earnings.filter(e=>e.status==="available").reduce((s,e)=>s+Number(e.amount_scr),0);
    const reserved = allocations.reduce((s,a)=>s+Number(a.amount_scr),0);
    const available = Math.max(0,grossAvailable-reserved);
    if (available <= 0) { setMessage("There is no available balance to withdraw."); return; }
    const raw = window.prompt("How much would you like to withdraw?\nAvailable balance: SCR " + available.toFixed(2), available.toFixed(2));
    if (raw === null) return;
    const amount = Number(raw.trim());
    if (!Number.isFinite(amount) || amount <= 0) { setMessage("Enter a valid withdrawal amount greater than zero."); return; }
    if (amount > available + 0.0001) { setMessage("You cannot withdraw more than your available balance of SCR " + available.toFixed(2) + "."); return; }
    setWithdrawalBusy(true); setMessage("");
    const { error } = await supabase.rpc("seller_request_withdrawal", { requested_amount: Number(amount.toFixed(2)) });
    if (error) setMessage(error.message);
    else { setMessage("Withdrawal request for SCR " + amount.toFixed(2) + " submitted."); setOpenWithdrawal(true); }
    await refresh(); setWithdrawalBusy(false);
  }

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


  function startEditing(product: Product) {
    setEditingProduct(product);
    setEditTitle(product.title);
    setEditDescription((product as Product & {description?:string}).description ?? "");
    setEditCategory((product as Product & {category?:string}).category ?? categories[0]);
    setEditPrice(String(product.price_scr));
    setEditStock(String(product.stock_quantity));
    const shippingProduct=product as Product & {shipping_days_min:number|null;shipping_days_max:number|null};
    setEditShippingMin(shippingProduct.shipping_days_min==null?"":String(shippingProduct.shipping_days_min));
    setEditShippingMax(shippingProduct.shipping_days_max==null?"":String(shippingProduct.shipping_days_max));
    setKeptImageUrls([...(product.image_urls ?? [])]);
    setEditImages([]);
    setMessage("");
  }

  function storagePathFromPublicUrl(url: string) {
    const marker = "/storage/v1/object/public/product-images/";
    const index = url.indexOf(marker);
    if (index < 0) return null;
    try { return decodeURIComponent(url.slice(index + marker.length).split("?")[0]); }
    catch { return null; }
  }

  async function saveProductEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shop || !editingProduct) return;
    const parsedPrice=Number(editPrice), parsedStock=Number(editStock);
    const minDays=editShippingMin.trim()?Number(editShippingMin):null, maxDays=editShippingMax.trim()?Number(editShippingMax):null;
    if (!Number.isFinite(parsedPrice) || parsedPrice<0 || !Number.isInteger(parsedStock) || parsedStock<0) {
      setMessage("Enter a valid price and whole-number stock quantity."); return;
    }
    if ((minDays===null)!==(maxDays===null) || (minDays!==null && (!Number.isInteger(minDays)||maxDays===null||maxDays===null||!Number.isInteger(maxDays)||minDays<1||maxDays<minDays||maxDays>90))) { setMessage("Enter both shipping estimates in days (1–90), with the maximum equal to or greater than the minimum."); return; }
    setBusy(true); setMessage("");
    const uploadedPaths:string[]=[];
    try {
      const nextImageUrls=[...keptImageUrls];
      for (const file of editImages) {
        const extension=file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path=shop.id+"/"+crypto.randomUUID()+"."+extension;
        const {error:uploadError}=await supabase.storage.from("product-images").upload(path,file,{
          contentType:file.type,cacheControl:"3600",upsert:false
        });
        if (uploadError) throw new Error("Image upload failed ("+file.name+"): "+uploadError.message+". Check the product-images bucket and storage policies.");
        uploadedPaths.push(path);
        nextImageUrls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }
      const {error:updateError}=await supabase.from("products").update({
        title:editTitle.trim(),description:editDescription.trim(),category:editCategory,
        price_scr:parsedPrice,stock_quantity:parsedStock,shipping_days_min:minDays,shipping_days_max:maxDays,image_urls:nextImageUrls,status:"pending_review"
      }).eq("id",editingProduct.id).eq("shop_id",shop.id);
      if (updateError) throw updateError;
      const removedPaths=(editingProduct.image_urls ?? [])
        .filter(url=>!keptImageUrls.includes(url))
        .map(storagePathFromPublicUrl)
        .filter((path):path is string=>!!path && path.startsWith(shop.id+"/"));
      if (removedPaths.length) {
        const {error:removeError}=await supabase.storage.from("product-images").remove(removedPaths);
        if (removeError) setMessage("Product saved, but an old image could not be deleted: "+removeError.message);
      }
      setEditingProduct(null);setEditImages([]);setKeptImageUrls([]);
      if (!message) setMessage("Product updated and sent for admin review. It will appear publicly again after approval.");
      await refresh();
    } catch(error) {
      if(uploadedPaths.length) await supabase.storage.from("product-images").remove(uploadedPaths);
      setMessage(error instanceof Error?error.message:"Couldn't update the product.");
    } finally { setBusy(false); }
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shop) return;
    const parsedPrice = Number(price), parsedStock = Number(stock);
    const minDays=shippingMin.trim()?Number(shippingMin):null, maxDays=shippingMax.trim()?Number(shippingMax):null;
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      setMessage("Enter a valid price and whole-number stock quantity."); return;
    }
    if ((minDays===null)!==(maxDays===null) || (minDays!==null && (!Number.isInteger(minDays)||maxDays===null||!Number.isInteger(maxDays)||minDays<1||maxDays<minDays||maxDays>90))) { setMessage("Enter both shipping estimates in days (1–90), with the maximum equal to or greater than the minimum."); return; }
    setBusy(true); setMessage("");
    try {
      const imageUrls: string[] = [];
      const uploadedPaths: string[] = [];
      try {
        for (const image of images) {
          const extension = image.name.split(".").pop()?.toLowerCase() || "jpg";
          const path = shop.id + "/" + crypto.randomUUID() + "." + extension;
          const { error: uploadError } = await supabase.storage.from("product-images").upload(path,image,{
            contentType:image.type,
            cacheControl:"3600",
            upsert:false
          });
          if (uploadError) throw new Error("Image upload failed (" + image.name + "): " + uploadError.message + ". Check that the product-images storage setup has been run in Supabase.");
          uploadedPaths.push(path);
          const { data } = supabase.storage.from("product-images").getPublicUrl(path);
          imageUrls.push(data.publicUrl);
        }
      } catch (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from("product-images").remove(uploadedPaths);
        throw uploadError;
      }
      const { error } = await supabase.from("products").insert({
        shop_id:shop.id,title:title.trim(),description:description.trim(),category,
        price_scr:parsedPrice,stock_quantity:parsedStock,shipping_days_min:minDays,shipping_days_max:maxDays,image_urls:imageUrls
      });
      if (error) throw error;
      setTitle("");setDescription("");setPrice("");setStock("1");setShippingMin("2");setShippingMax("5");setImages([]);
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
      <div className="seller-dash-title"><div><div className="eyebrow">SELLER CENTRE</div><h1>{shop?.name || "Your shop"}</h1><p><Store size={15}/> {shop?.island || "Seychelles"} · Manage your listings</p></div><div className="seller-title-actions"><Link href="/seller/add-product" className="seller-orders-link"><ImagePlus size={16}/> Add product</Link><Link href="/seller/products" className="seller-orders-link"><Package size={16}/> Products</Link><Link href="/seller/analytics" className="seller-orders-link"><BarChart3 size={16}/> Analytics</Link><Link href="/seller/vouchers" className="seller-orders-link"><Ticket size={16}/> Vouchers</Link><Link href="/seller/orders" className="seller-orders-link"><ShoppingBag size={16}/> Customer orders</Link><div className="seller-count"><Package size={19}/><b>{products.length}</b><span>Products</span></div></div></div>
      
      <section className="seller-balance-panel">
        <div className="seller-balance-heading"><div><div className="eyebrow">SELLER WALLET</div><h2>Your balance</h2><p>Card-payment earnings released after customers confirm delivery.</p></div><span className="seller-wallet-icon">SCR</span></div>
        <div className="seller-balance-grid">
          <div><small>Available balance</small><strong>SCR {Math.max(0,earnings.filter(e=>e.status==="available").reduce((s,e)=>s+Number(e.amount_scr),0)-allocations.reduce((s,a)=>s+Number(a.amount_scr),0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Ready for withdrawal request</span></div>
          <div><small>Withdrawal pending</small><strong>SCR {(earnings.filter(e=>e.status==="withdrawal_pending").reduce((s,e)=>s+Number(e.amount_scr),0)+withdrawals.filter(w=>w.status==="pending"||w.status==="processing").reduce((s,w)=>s+Number(w.amount_scr),0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Awaiting admin processing</span></div>
          <div><small>Total paid out</small><strong>SCR {(earnings.filter(e=>e.status==="paid").reduce((s,e)=>s+Number(e.amount_scr),0)+withdrawals.filter(w=>w.status==="paid").reduce((s,w)=>s+Number(w.amount_scr),0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Marked as paid by admin</span></div>
        </div>
        <div className="seller-balance-footer"><div className="seller-balance-note">All orders are paid in the app. Earnings become available after the customer confirms receipt. A withdrawal request reserves your full available balance until the admin processes it.</div><button type="button" className="seller-withdraw-button" onClick={requestWithdrawal} disabled={withdrawalBusy || earnings.every(e=>e.status!=="available") || Math.max(0,earnings.filter(e=>e.status==="available").reduce((s,e)=>s+Number(e.amount_scr),0)-allocations.reduce((s,a)=>s+Number(a.amount_scr),0))<=0}>{withdrawalBusy ? "Submitting request…" : "Request withdrawal"}</button></div>
      </section>
      <section className="seller-dash-panel seller-shopfront-editor">
        <h2>Customise your shopfront</h2>
        <p>Give customers a better first impression when they visit your public shop page.</p>
        <form className="account-form" onSubmit={saveShopfront}>
          <label>Shop description<textarea maxLength={500} value={shopDescription} onChange={e=>setShopDescription(e.target.value)} placeholder="Tell customers what your shop sells, what makes it special and where you operate."/></label>
          <label>Shop banner image URL<input type="url" value={shopBannerUrl} onChange={e=>setShopBannerUrl(e.target.value)} placeholder="https://example.com/your-shop-banner.jpg"/></label>
          {shopBannerUrl && <div className="seller-shopfront-preview"><img src={shopBannerUrl} alt="Shop banner preview"/></div>}
          <div className="seller-shopfront-actions"><button className="primary account-submit" disabled={shopfrontBusy}>{shopfrontBusy ? "Saving shopfront…" : "Save shopfront"}</button><Link href={shop ? "/shop/"+shop.id : "/"} className="seller-orders-link">Preview public shop</Link></div>
        </form>
      </section>
      <section className={"seller-holiday-panel " + (shop?.holiday_mode ? "is-on" : "")}>
        <div className="seller-holiday-copy">
          <span className="seller-holiday-icon">🌴</span>
          <div><h2>Holiday Mode</h2><p>{shop?.holiday_mode ? "Your shop is taking a break. Approved products are hidden from the marketplace and cannot be added to new carts." : "Taking a break? Hide all your approved products from shoppers until you are ready to sell again."}</p></div>
        </div>
        <button type="button" className="seller-holiday-toggle" onClick={toggleHolidayMode} disabled={busy}>
          {busy ? "Updating…" : shop?.holiday_mode ? "Turn off Holiday Mode" : "Turn on Holiday Mode"}
        </button>
        <span className={"seller-holiday-status " + (shop?.holiday_mode ? "active" : "")}>{shop?.holiday_mode ? "HOLIDAY MODE ON" : "SHOP ACTIVE"}</span>
      </section>
      <section className="seller-dash-panel seller-tools-overview">
        <div className="seller-section-heading"><div><h2>Manage your catalogue</h2><p>Add new listings or manage the products already in your shop.</p></div></div>
        <div className="seller-tools-grid">
          <Link href="/seller/add-product" className="seller-tool-card"><span><ImagePlus size={23}/></span><div><b>Add a product</b><small>Create a new listing with photos, price, stock and delivery estimates.</small></div><strong>Open <span>→</span></strong></Link>
          <Link href="/seller/products" className="seller-tool-card"><span><Package size={23}/></span><div><b>Your products</b><small>View listings, check approval status, update stock and edit products.</small></div><strong>{products.length} listings <span>→</span></strong></Link>
        </div>
      </section>
    </div>
  </main>;
}
