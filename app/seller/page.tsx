"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, ImagePlus, Package, Store, ShoppingBag, BarChart3 } from "lucide-react";

type Shop = { id: string; name: string; island: string | null };
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
    const { data: shops, error } = await supabase.from("shops").select("id,name,island").eq("owner_id",user.id).limit(1);
    if (error || !shops?.length) { setMessage("We couldn't find your shop. Please create it from your account page."); setLoading(false); return; }
    setShop(shops[0] as Shop);
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
    if ((minDays===null)!==(maxDays===null) || (minDays!==null && (!Number.isInteger(minDays)||!Number.isInteger(maxDays)||minDays<1||maxDays<minDays||maxDays>90))) { setMessage("Enter both shipping estimates in days (1–90), with the maximum equal to or greater than the minimum."); return; }
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
    if ((minDays===null)!==(maxDays===null) || (minDays!==null && (!Number.isInteger(minDays)||!Number.isInteger(maxDays)||minDays<1||maxDays<minDays||maxDays>90))) { setMessage("Enter both shipping estimates in days (1–90), with the maximum equal to or greater than the minimum."); return; }
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
      <div className="seller-dash-title"><div><div className="eyebrow">SELLER CENTRE</div><h1>{shop?.name || "Your shop"}</h1><p><Store size={15}/> {shop?.island || "Seychelles"} · Manage your listings</p></div><div className="seller-title-actions"><Link href="/seller/analytics" className="seller-orders-link"><BarChart3 size={16}/> Analytics</Link><Link href="/seller/orders" className="seller-orders-link"><ShoppingBag size={16}/> Customer orders</Link><div className="seller-count"><Package size={19}/><b>{products.length}</b><span>Products</span></div></div></div>
      
      <section className="seller-balance-panel">
        <div className="seller-balance-heading"><div><div className="eyebrow">SELLER WALLET</div><h2>Your balance</h2><p>Card-payment earnings released after customers confirm delivery.</p></div><span className="seller-wallet-icon">SCR</span></div>
        <div className="seller-balance-grid">
          <div><small>Available balance</small><strong>SCR {Math.max(0,earnings.filter(e=>e.status==="available").reduce((s,e)=>s+Number(e.amount_scr),0)-allocations.reduce((s,a)=>s+Number(a.amount_scr),0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Ready for withdrawal request</span></div>
          <div><small>Withdrawal pending</small><strong>SCR {(earnings.filter(e=>e.status==="withdrawal_pending").reduce((s,e)=>s+Number(e.amount_scr),0)+withdrawals.filter(w=>w.status==="pending"||w.status==="processing").reduce((s,w)=>s+Number(w.amount_scr),0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Awaiting admin processing</span></div>
          <div><small>Total paid out</small><strong>SCR {(earnings.filter(e=>e.status==="paid").reduce((s,e)=>s+Number(e.amount_scr),0)+withdrawals.filter(w=>w.status==="paid").reduce((s,w)=>s+Number(w.amount_scr),0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>Marked as paid by admin</span></div>
        </div>
        <div className="seller-balance-footer"><div className="seller-balance-note">All orders are paid in the app. Earnings become available after the customer confirms receipt. A withdrawal request reserves your full available balance until the admin processes it.</div><button type="button" className="seller-withdraw-button" onClick={requestWithdrawal} disabled={withdrawalBusy || earnings.every(e=>e.status!=="available") || Math.max(0,earnings.filter(e=>e.status==="available").reduce((s,e)=>s+Number(e.amount_scr),0)-allocations.reduce((s,a)=>s+Number(a.amount_scr),0))<=0}>{withdrawalBusy ? "Submitting request…" : "Request withdrawal"}</button></div>
      </section>
      <div className="seller-dash-grid">
        <section className="seller-dash-panel"><h2>Add a product</h2><p>New listings are checked before they become visible to shoppers.</p>
          <form className="account-form" onSubmit={addProduct}>
            <label className="upload-label seller-upload-first"><ImagePlus size={18}/> Product images (JPG, PNG or WebP, max 5 MB each)
              <input className="seller-upload-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{
                const selected = Array.from(e.target.files ?? []);
                const invalid = selected.find(file=>!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024);
                if (invalid) { setMessage(invalid.size > 5*1024*1024 ? invalid.name + " is larger than 5 MB." : invalid.name + " is not a supported image type."); e.target.value=""; return; }
                setImages(current=>[...current,...selected].filter((file,index,all)=>all.findIndex(other=>other.name===file.name && other.size===file.size && other.lastModified===file.lastModified)===index));
                e.target.value="";
              }}/>
              <small>{images.length ? images.length + " image(s) selected" : "Select multiple images. Previews will appear here."}</small>
              {images.length>0 && <div className="seller-edit-image-grid seller-upload-preview-grid">{images.map((file,index)=><LocalImagePreview key={file.name+file.lastModified+index} file={file} onRemove={()=>setImages(current=>current.filter((_,i)=>i!==index))}/>)}</div>}
            </label>
            <label>Product name<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Mountain bike"/></label>
            <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the product, condition and details"/></label>
            <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
            <div className="seller-form-row"><label>Price (SCR)<input required type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></label><label>Stock quantity<input required type="number" min="0" step="1" value={stock} onChange={e=>setStock(e.target.value)}/></label></div>
            <div className="seller-shipping-estimate"><b>Estimated shipping time</b><small>Set how many days delivery usually takes. Leave both blank if you need to confirm it after an order.</small><div className="seller-form-row"><label>Minimum days<input type="number" min="1" max="90" value={shippingMin} onChange={e=>setShippingMin(e.target.value)} placeholder="e.g. 2"/></label><label>Maximum days<input type="number" min="1" max="90" value={shippingMax} onChange={e=>setShippingMax(e.target.value)} placeholder="e.g. 5"/></label></div></div>
            <button className="primary account-submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
          </form>
          {message&&<div className="account-message" role="status">{message}</div>}
        </section>

        {editingProduct && <section className="seller-dash-panel seller-edit-panel">
          <div className="seller-edit-heading"><div><h2>Edit product</h2><p>Changes to a live listing go back to admin review.</p></div><button type="button" onClick={()=>setEditingProduct(null)}>Cancel</button></div>
          <form className="account-form" onSubmit={saveProductEdits}>
            <label>Product name<input required maxLength={120} value={editTitle} onChange={e=>setEditTitle(e.target.value)}/></label>
            <label>Description<textarea value={editDescription} onChange={e=>setEditDescription(e.target.value)}/></label>
            <label>Category<select value={editCategory} onChange={e=>setEditCategory(e.target.value)}>{categories.map(item=><option key={item}>{item}</option>)}</select></label>
            <div className="seller-form-row"><label>Price (SCR)<input required type="number" min="0" step="0.01" value={editPrice} onChange={e=>setEditPrice(e.target.value)}/></label><label>Stock quantity<input required type="number" min="0" step="1" value={editStock} onChange={e=>setEditStock(e.target.value)}/></label></div>
            <div className="seller-shipping-estimate"><b>Estimated shipping time</b><small>Set a delivery range in days (1–90), or leave both blank to confirm later.</small><div className="seller-form-row"><label>Minimum days<input type="number" min="1" max="90" value={editShippingMin} onChange={e=>setEditShippingMin(e.target.value)} placeholder="e.g. 2"/></label><label>Maximum days<input type="number" min="1" max="90" value={editShippingMax} onChange={e=>setEditShippingMax(e.target.value)} placeholder="e.g. 5"/></label></div></div>
            <div className="seller-edit-images"><b>Current pictures</b>
              {keptImageUrls.length===0?<small>No pictures currently attached.</small>:<div className="seller-edit-image-grid">{keptImageUrls.map((url,index)=><div className="seller-edit-image" key={url}><img src={url} alt={"Product image "+(index+1)}/><button type="button" onClick={()=>setKeptImageUrls(current=>current.filter(item=>item!==url))}>Remove</button></div>)}</div>}
            </div>
            <label className="upload-label"><span className="seller-upload-title"><ImagePlus size={18}/> Add more pictures</span><small>JPG, PNG or WebP, max 5 MB each.</small>
              <input className="seller-upload-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{
                const selected=Array.from(e.target.files ?? []);
                const invalid=selected.find(file=>!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024);
                if(invalid){setMessage(invalid.size>5*1024*1024?invalid.name+" is larger than 5 MB.":invalid.name+" is not a supported image type.");e.target.value="";return;}
                setEditImages(current=>[...current,...selected].filter((file,index,all)=>all.findIndex(other=>other.name===file.name&&other.size===file.size&&other.lastModified===file.lastModified)===index));
                e.target.value="";
              }}/>
              <small>{editImages.length?editImages.length+" new picture(s) selected":"Choose one or more new pictures."}</small>
              {editImages.length>0 && <div className="seller-edit-image-grid seller-upload-preview-grid">{editImages.map((file,index)=><LocalImagePreview key={file.name+file.lastModified+index} file={file} onRemove={()=>setEditImages(current=>current.filter((_,i)=>i!==index))}/>)}</div>}
            </label>
            <button className="primary account-submit" disabled={busy}>{busy?"Saving changes…":"Save product changes"}</button>
          </form>
        </section>}

        <section className="seller-dash-panel"><h2>Your products</h2><p>Track the review status of your listings.</p>
          {products.length===0?<div className="seller-empty"><Package size={32}/><b>No products yet</b><span>Your submitted products will appear here.</span></div>:<div className="seller-products">{products.map(p=><article className="seller-product-row" key={p.id}><div className="seller-product-thumb">{p.image_urls?.[0]?<img src={p.image_urls[0]} alt=""/>:<Package size={22}/>}</div><div className="seller-product-detail"><b>{p.title}</b><span>SCR {Number(p.price_scr).toLocaleString()} · Stock {p.stock_quantity}</span><small className={"status-"+p.status}>{p.is_archived ? "archived" : p.status.replace("_"," ")}</small><div className="seller-product-controls">{!p.is_archived && <><button type="button" disabled={busy} onClick={()=>startEditing(p)}>Edit product</button><button type="button" disabled={busy} onClick={()=>adjustStock(p,1)}>+ Add stock</button><button type="button" disabled={busy} onClick={()=>adjustStock(p,-1)}>− Remove stock</button><button type="button" className="seller-archive-button" disabled={busy} onClick={()=>archiveProduct(p)}>Delete listing</button></>}</div></div></article>)}</div>}
        </section>
      </div>
    </div>
  </main>;
}
