"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, ShoppingBag, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

type SavedProduct = {
  id: string;
  title: string;
  category: string;
  price_scr: number;
  description: string | null;
  image_urls: string[] | null;
  shops: { name: string; island: string | null } | null;
};
type WishlistRow = { id: string; product_id: string; created_at: string; products: SavedProduct | null };

export default function WishlistPage() {
  const router = useRouter();
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function loadWishlist() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const { data, error } = await supabase.from("wishlists")
      .select("id,product_id,created_at,products(id,title,category,price_scr,description,image_urls,shops(name,island))")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) setNotice(error.message);
    setRows((data ?? []) as unknown as WishlistRow[]);
    setLoading(false);
  }

  useEffect(() => { loadWishlist(); }, []);

  async function removeFavourite(productId: string) {
    setBusy(productId); setNotice("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const { error } = await supabase.from("wishlists").delete().eq("user_id", user.id).eq("product_id", productId);
    if (error) setNotice(error.message);
    else setRows(old => old.filter(row => row.product_id !== productId));
    setBusy("");
  }

  function addToCart(productId: string) {
    try {
      const existing = JSON.parse(localStorage.getItem("island-express-cart") || "[]");
      localStorage.setItem("island-express-cart", JSON.stringify([...existing, productId]));
      setNotice("Added to your cart");
    } catch { setNotice("Could not update your cart. Please try again."); }
    window.setTimeout(() => setNotice(""), 1800);
  }

  return <main className="wishlist-page">
    <header className="wishlist-header">
      <Link href="/" className="account-back"><ArrowLeft size={17}/> Back to shopping</Link>
      <Link href="/" className="account-brand">island<span>express</span></Link>
    </header>
    <section className="wishlist-wrap">
      <div className="wishlist-heading">
        <div><div className="eyebrow">YOUR SAVED FINDS</div><h1>My Favourites</h1><p>Keep the products you love in one place.</p></div>
        <div className="wishlist-count"><Heart size={17}/>{rows.length} saved</div>
      </div>
      {notice && <div className="account-message">{notice}</div>}
      {loading ? <div className="wishlist-empty">Loading your favourites…</div> :
        rows.length === 0 ? <div className="wishlist-empty"><span className="wishlist-empty-icon"><Heart size={30}/></span><h2>Your favourites list is empty</h2><p>Tap the heart on any product to save it here for later.</p><Link className="primary" href="/">Explore products</Link></div> :
        <div className="wishlist-grid">{rows.filter(row=>row.products).map(row => {
          const product = row.products!;
          return <article className="wishlist-product" key={row.id}>
            <div className="wishlist-product-image">{product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.title}/> : <span>📦</span>}</div>
            <div className="wishlist-product-info">
              <small>{product.category}</small><h2>{product.title}</h2>
              <p>{product.shops?.name ?? "Island Express seller"} · {product.shops?.island ?? "Seychelles"}</p>
              <strong>SCR {Number(product.price_scr).toLocaleString()}</strong>
              <div className="wishlist-product-actions">
                <button className="wishlist-cart-button" onClick={()=>addToCart(product.id)}><ShoppingBag size={15}/> Add to cart</button>
                <button className="wishlist-remove-button" disabled={busy===product.id} onClick={()=>removeFavourite(product.id)} aria-label="Remove favourite"><Trash2 size={16}/></button>
              </div>
            </div>
          </article>;
        })}</div>}
    </section>
  </main>;
}
