"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, RefreshCw, TrendingUp, ShoppingBag, Package, Wallet, BarChart3 } from "lucide-react";

type Line = {
  id: string;
  product_id: string | null;
  product_title: string;
  unit_price_scr: number;
  quantity: number;
  order: {
    id: string;
    status: string;
    payment_method: string;
    payment_status: string | null;
    created_at: string;
  } | null;
};

type Product = { id: string; title: string; status: string; stock_quantity: number };

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("Your shop");
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "seller") { router.replace("/account"); return; }
    const { data: shops, error: shopError } = await supabase.from("shops").select("id,name").eq("owner_id", user.id).limit(1);
    if (shopError || !shops?.length) {
      setMessage("We couldn't find your shop. Please create your shop first.");
      setLoading(false);
      return;
    }
    const shop = shops[0];
    setShopName(shop.name);
    const [itemsResult, productsResult] = await Promise.all([
      supabase.from("order_items")
        .select("id,product_id,product_title,unit_price_scr,quantity,order:orders!inner(id,status,payment_method,payment_status,created_at),product:products!inner(shop_id)")
        .eq("product.shop_id", shop.id),
      supabase.from("products").select("id,title,status,stock_quantity").eq("shop_id", shop.id)
    ]);
    if (itemsResult.error) setMessage("Couldn't load sales analytics: " + itemsResult.error.message);
    else setLines((itemsResult.data ?? []) as unknown as Line[]);
    if (productsResult.error) setMessage("Couldn't load product statistics: " + productsResult.error.message);
    else setProducts((productsResult.data ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const valid = lines.filter(line => line.order && line.order.status !== "cancelled" && (
      line.order.payment_status === "paid" || line.order.payment_method === "cash_on_delivery"
    ));
    const revenue = valid.reduce((sum, line) => sum + Number(line.unit_price_scr) * line.quantity, 0);
    const monthLines = valid.filter(line => new Date(line.order!.created_at) >= monthStart);
    const monthRevenue = monthLines.reduce((sum, line) => sum + Number(line.unit_price_scr) * line.quantity, 0);
    const orderIds = new Set(valid.map(line => line.order!.id));
    const monthOrderIds = new Set(monthLines.map(line => line.order!.id));
    const units = valid.reduce((sum, line) => sum + line.quantity, 0);
    const best = new Map<string, { title: string; units: number; revenue: number }>();
    valid.forEach(line => {
      const key = line.product_id || line.product_title;
      const current = best.get(key) || { title: line.product_title, units: 0, revenue: 0 };
      current.units += line.quantity;
      current.revenue += Number(line.unit_price_scr) * line.quantity;
      best.set(key, current);
    });
    return {
      revenue, monthRevenue, orders: orderIds.size, monthOrders: monthOrderIds.size, units,
      best: [...best.values()].sort((a,b) => b.units-a.units).slice(0,5),
      paidOrders: new Set(valid.filter(l=>l.order?.payment_status==="paid").map(l=>l.order!.id)).size,
      pendingOrders: new Set(lines.filter(l=>l.order && l.order.status!=="cancelled" && l.order.status!=="completed").map(l=>l.order!.id)).size
    };
  }, [lines]);

  const approved = products.filter(p=>p.status==="approved").length;
  const pending = products.filter(p=>p.status==="pending_review").length;
  const lowStock = products.filter(p=>p.status==="approved" && p.stock_quantity<=3).length;

  return <main className="seller-dashboard">
    <header className="seller-dash-header">
      <Link href="/seller" className="account-back"><ArrowLeft size={16}/> Seller Centre</Link>
      <Link href="/" className="account-brand">island<span>express</span></Link>
    </header>
    <div className="seller-orders-wrap">
      <div className="seller-orders-heading">
        <div><div className="eyebrow">SELLER CENTRE · PERFORMANCE</div><h1>{shopName} analytics</h1><p>Track your shop's sales, orders and products.</p></div>
        <button className="admin-refresh" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button>
      </div>
      {message && <div className="account-message" role="status">{message}</div>}
      {loading ? <div className="seller-order-empty">Loading your analytics…</div> : <>
        <div className="seller-analytics-grid">
          <article className="seller-analytics-card"><span><Wallet size={18}/> Recorded sales</span><strong>SCR {stats.revenue.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>Paid card orders and non-cancelled cash-on-delivery orders</small></article>
          <article className="seller-analytics-card"><span><TrendingUp size={18}/> This month</span><strong>SCR {stats.monthRevenue.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>{stats.monthOrders} order{stats.monthOrders===1?"":"s"} this month</small></article>
          <article className="seller-analytics-card"><span><ShoppingBag size={18}/> Orders</span><strong>{stats.orders}</strong><small>{stats.pendingOrders} active · {stats.paidOrders} paid by card</small></article>
          <article className="seller-analytics-card"><span><Package size={18}/> Units sold</span><strong>{stats.units}</strong><small>{products.length} listed products in your shop</small></article>
        </div>
        <div className="seller-analytics-columns">
          <section className="seller-dash-panel"><h2><BarChart3 size={18}/> Best-selling products</h2><p>Ranked by units sold across your recorded orders.</p>
            {stats.best.length===0 ? <div className="seller-empty"><Package size={30}/><b>No sales data yet</b><span>Your product performance will appear here after orders arrive.</span></div> :
              <div className="seller-products">{stats.best.map((item,index)=><div className="seller-product-row" key={item.title}><div className="seller-rank">{index+1}</div><div className="seller-product-detail"><b>{item.title}</b><span>{item.units} units sold</span></div><strong className="seller-analytics-amount">SCR {item.revenue.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div>)}</div>}
          </section>
          <section className="seller-dash-panel"><h2>Product health</h2><p>Quick overview of your current listings.</p>
            <div className="seller-health-row"><span>Approved listings</span><b>{approved}</b></div>
            <div className="seller-health-row"><span>Pending review</span><b>{pending}</b></div>
            <div className="seller-health-row"><span>Low stock (3 or fewer)</span><b>{lowStock}</b></div>
            <div className="seller-health-row"><span>Total listings</span><b>{products.length}</b></div>
            <Link href="/seller/orders" className="seller-orders-link seller-analytics-link"><ShoppingBag size={16}/> View customer orders</Link>
          </section>
        </div>
        <p className="seller-analytics-note">Sales figures are estimates from order records, not withdrawable earnings. Cash-on-delivery orders are included unless cancelled; card sales are counted only after payment is marked paid. Delivery fees are excluded.</p>
      </>}
    </div>
  </main>;
}
