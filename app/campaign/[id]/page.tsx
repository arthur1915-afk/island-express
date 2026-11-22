"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, ShoppingBag, RefreshCw } from "lucide-react";

type Campaign = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  background_style: string;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  price_scr: number;
  image_urls: string[] | null;
  category: string;
  shops: { name: string; island: string | null } | null;
};

export default function CampaignOffersPage() {
  const params = useParams<{ id: string }>();
  const campaignId = String(params.id ?? "");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!campaignId) {
      setNotice("The campaign link is invalid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotice("");

    const now = new Date().toISOString();
    const { data: campaignRow, error: campaignError } = await supabase
      .from("promotional_campaigns")
      .select("id,eyebrow,title,subtitle,description,image_url,background_style")
      .eq("id", campaignId)
      .eq("is_active", true)
      .lte("starts_at", now)
      .or("ends_at.is.null,ends_at.gt." + now)
      .maybeSingle();

    if (campaignError) {
      setNotice("Could not load this campaign. " + campaignError.message);
      setLoading(false);
      return;
    }

    if (!campaignRow) {
      setCampaign(null);
      setProducts([]);
      setNotice("This campaign is not currently published or has expired.");
      setLoading(false);
      return;
    }

    setCampaign(campaignRow as Campaign);

    const { data: submissionRows, error: submissionError } = await supabase
      .from("promotional_campaign_products")
      .select("product_id")
      .eq("campaign_id", campaignId);

    if (submissionError) {
      setNotice(
        submissionError.message.includes("promotional_campaign_products")
          ? "Campaign product setup is missing. The administrator needs to run supabase/promotional_campaign_products_setup.sql in Supabase SQL Editor."
          : "Could not load campaign submissions. " + submissionError.message
      );
      setLoading(false);
      return;
    }

    const productIds = (submissionRows ?? []).map((row) => row.product_id);
    if (productIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id,title,description,price_scr,image_urls,category,shops(name,island)")
      .in("id", productIds)
      .eq("status", "approved")
      .or("is_archived.is.null,is_archived.eq.false");

    if (productError) {
      setNotice("Campaign products were found, but their details could not be loaded. " + productError.message);
      setLoading(false);
      return;
    }

    const productsById = new Map((productRows ?? []).map((product: any) => [product.id, product]));
    setProducts(productIds.map((id) => productsById.get(id)).filter(Boolean) as Product[]);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="account-page campaign-offers-page">
      <div className="admin-wrap campaign-offers-wrap">
        <Link href="/" className="account-back">
          <ArrowLeft size={16} /> Back to islandXpress
        </Link>

        {campaign && (
          <section
            className={"campaign-slide campaign-style-" + campaign.background_style}
            style={{ marginTop: 24, minHeight: 240, borderRadius: 20, overflow: "hidden", position: "relative" }}
          >
            {campaign.image_url && <img className="campaign-background-image" src={campaign.image_url} alt="" />}
            <div className="campaign-slide-copy">
              <span className="campaign-eyebrow">{campaign.eyebrow}</span>
              <h1>{campaign.title}</h1>
              {campaign.subtitle && <h2>{campaign.subtitle}</h2>}
              {campaign.description && <p>{campaign.description}</p>}
            </div>
          </section>
        )}

        <section className="section campaign-offers-section">
          <div className="section-head campaign-offers-heading">
            <div>
              <div className="eyebrow">SPECIAL OFFERS</div>
              <h2>{campaign?.title ?? "Explore offers"}</h2>
              <p>Products selected by Seychelles sellers for this campaign.</p>
            </div>
            {!loading && !notice && <span>{products.length} offer{products.length === 1 ? "" : "s"}</span>}
          </div>

          {loading ? (
            <div className="empty">Loading campaign products…</div>
          ) : notice ? (
            <div className="empty campaign-offers-message">
              <p>{notice}</p>
              <button className="admin-refresh" onClick={() => void load()}>
                <RefreshCw size={15} /> Try again
              </button>
            </div>
          ) : products.length > 0 ? (
            <div className="product-grid campaign-offers-grid">
              {products.map((product) => (
                <article className="product campaign-offer-card" key={product.id}>
                  <div className="product-image campaign-offer-image">
                    <Link href={"/product/" + product.id} className="product-image-link">
                      {product.image_urls?.[0] ? (
                        <img className="market-product-image" src={product.image_urls[0]} alt={product.title} />
                      ) : (
                        <span className="product-emoji">📦</span>
                      )}
                    </Link>
                  </div>
                  <div className="product-info">
                    <small>{product.category || "General"}</small>
                    <Link href={"/product/" + product.id} className="product-title-link">
                      <h3>{product.title}</h3>
                    </Link>
                    <div className="seller">
                      {product.shops?.name ?? "Seychelles seller"} · {product.shops?.island ?? "Seychelles"}
                    </div>
                    <div className="price">SCR {Number(product.price_scr).toLocaleString()}</div>
                    <Link href={"/product/" + product.id} className="campaign-cta">
                      View product <ShoppingBag size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              No approved products have been submitted to this campaign yet. Sellers can add products from Seller Centre → Campaigns.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
