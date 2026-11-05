"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, ShoppingBag, Star } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Product = {
  id: string;
  title: string;
  category: string;
  price_scr: number;
  description: string | null;
  image_urls: string[] | null;
  shops: { name: string; island: string | null } | null;
};

function SearchResults() {
  const params = useSearchParams();
  const term = (params.get("q") || "").trim();
  const [input, setInput] = useState(term);
  const [products, setProducts] = useState<Product[]>([]);
  const [ratings, setRatings] = useState<Record<string, {average:number;count:number}>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setInput(term);
    setLoading(true);
    setError("");
    if (!term) {
      setProducts([]);
      setLoading(false);
      return () => { active = false; };
    }
    const pattern = term.replace(/[,%()]/g, " ").trim();
    supabase
      .from("products")
      .select("id,title,category,price_scr,description,image_urls,shops(name,island)")
      .eq("status", "approved")
      .or(`title.ilike.%${pattern}%,description.ilike.%${pattern}%`)
      .order("created_at", { ascending: false })
      .then(({ data, error: searchError }) => {
        if (!active) return;
        if (searchError) setError("We couldn't load search results. Please try again.");
        setProducts((data ?? []) as unknown as Product[]);
        const ids=(data??[]).map((p:any)=>p.id);
        if(ids.length){const {data:rows}=await supabase.from("product_reviews").select("product_id,rating").in("product_id",ids).eq("status","approved");const grouped:Record<string,{total:number;count:number}>={};(rows??[]).forEach((r:{product_id:string;rating:number})=>{grouped[r.product_id]??={total:0,count:0};grouped[r.product_id].total+=r.rating;grouped[r.product_id].count++;});setRatings(Object.fromEntries(Object.entries(grouped).map(([id,v])=>[id,{average:v.total/v.count,count:v.count}])));}
        setLoading(false);
      });
    return () => { active = false; };
  }, [term]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    window.location.href = value ? `/search?q=${encodeURIComponent(value)}` : "/search";
  }

  return (
    <main className="search-page">
      <header className="search-page-header">
        <Link href="/" className="search-back"><ArrowLeft size={17}/> Home</Link>
        <Link href="/" className="search-page-brand"><ShoppingBag size={19}/> island<span>express</span></Link>
      </header>
      <section className="search-results-wrap">
        <form className="search-results-form" onSubmit={submit}>
          <Search size={19}/>
          <input name="q" value={input} onChange={e => setInput(e.target.value)} placeholder="Search products..." aria-label="Search products"/>
          <button type="submit">Search</button>
        </form>
        {term ? (
          <>
            <div className="search-results-heading">
              <h1>Search results</h1>
              <p>Results for <strong>“{term}”</strong></p>
            </div>
            {loading ? <div className="search-results-empty">Searching products…</div> :
              error ? <div className="search-results-empty">{error}</div> :
              products.length ? (
                <>
                  <p className="search-results-count">{products.length} matching product{products.length === 1 ? "" : "s"}</p>
                  <div className="search-results-grid">
                    {products.map(product => (
                      <Link href={"/product/" + product.id} className="search-result-card" key={product.id}>
                        <div className="search-result-image">
                          {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.title}/> : <span>📦</span>}
                        </div>
                        <div className="search-result-info">
                          <small>{product.category}</small>
                          <h2>{product.title}</h2>
                          <p>{product.shops?.name || "Island Express seller"} · {product.shops?.island || "Seychelles"}</p>
                          <strong>SCR {Number(product.price_scr).toLocaleString()}</strong><div className="product-card-rating"><span className="rating-stars"><Star size={14} fill={ratings[product.id]?"currentColor":"none"}/></span>{ratings[product.id]?<><b>{ratings[product.id].average.toFixed(1)}</b><span>({ratings[product.id].count} {ratings[product.id].count===1?"review":"reviews"})</span></>:<span>No reviews yet</span>}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              ) : <div className="search-results-empty">No products found for “{term}”. Try another search.</div>}
          </>
        ) : (
          <div className="search-results-empty">Enter a product name or keyword to search.</div>
        )}
      </section>
    </main>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<main className="search-page"><div className="search-results-empty">Loading search…</div></main>}><SearchResults/></Suspense>;
}
