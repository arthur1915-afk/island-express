"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, RefreshCw, ShoppingBag, Star } from "lucide-react";
import { supabase } from "../../lib/supabase";

type OrderItem = {
  id: string;
  product_title: string;
  unit_price_scr: number;
  quantity: number;
  shop_name: string | null;
};
type Order = {
  id: string;
  customer_name: string;
  subtotal_scr: number;
  delivery_fee_scr: number;
  total_scr: number;
  payment_method: string;
  payment_status?: string;
  status: string;
  created_at: string;
  order_items: OrderItem[];
  seller_order_fulfillments?: { shop_id: string; status: string; courier: string | null; tracking_number: string | null; estimated_delivery: string | null; shipping_note: string | null; updated_at: string }[];
};

function label(value?: string) {
  return (value || "pending").replaceAll("_", " ");
}

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");\n  const [reviewed, setReviewed] = useState<string[]>([]);\n  const [reviewProduct, setReviewProduct] = useState<string | null>(null);\n  const [reviewRating, setReviewRating] = useState(5);\n  const [reviewTitle, setReviewTitle] = useState("");\n  const [reviewBody, setReviewBody] = useState("");\n  const [reviewBusy, setReviewBusy] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }

    const { data, error } = await supabase
      .from("orders")
      .select("id,customer_name,subtotal_scr,delivery_fee_scr,total_scr,payment_method,payment_status,status,created_at,order_items(id,product_id,product_title,unit_price_scr,quantity,shop_name),seller_order_fulfillments(shop_id,status,courier,tracking_number,estimated_delivery,shipping_note,updated_at)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) setMessage(error.message);
    setOrders((data ?? []) as unknown as Order[]);
    setLoading(false);
  }

  useEffect(() => { loadOrders(); }, []);\n\n  async function submitReview(orderId:string, productId:string) {\n    if (!reviewBody.trim()) { setMessage("Please write a short review before submitting."); return; }\n    setReviewBusy(true); setMessage("");\n    const { data: { user } } = await supabase.auth.getUser();\n    if (!user) { setMessage("Please sign in again."); setReviewBusy(false); return; }\n    const { error } = await supabase.from("product_reviews").insert({ order_id:orderId, product_id:productId, customer_id:user.id, rating:reviewRating, title:reviewTitle.trim() || null, body:reviewBody.trim(), status:"pending" });\n    if (error) setMessage(error.message);\n    else { setReviewed(old => [...old, productId]); setReviewProduct(null); setReviewTitle(""); setReviewBody(""); setMessage("Thank you! Your review has been submitted for approval."); }\n    setReviewBusy(false);\n  }

  return <main className="cart-page">
    <header className="cart-page-header">
      <Link href="/" className="account-brand">island<span>express</span></Link>
      <span>YOUR PURCHASES</span>
    </header>
    <div className="cart-page-wrap">
      <Link href="/account" className="cart-back"><ArrowLeft size={16}/> My account</Link>
      <div className="seller-orders-heading">
        <div><div className="eyebrow">CUSTOMER CENTRE</div><h1>My Orders</h1><p>Track your purchases and payment status.</p></div>
        <button className="admin-refresh" onClick={loadOrders}><RefreshCw size={15}/> Refresh</button>
      </div>
      {message && <div className="account-message">{message}</div>}
      {loading ? <div className="seller-order-empty">Loading your orders…</div> :
        orders.length === 0 ? <div className="cart-empty"><ShoppingBag size={38}/><h2>No orders yet</h2><p>Your purchases will appear here after checkout.</p><Link href="/" className="primary">Start shopping</Link></div> :
        <div className="seller-order-list">{orders.map(order => (
          <article className="seller-order-card" key={order.id}>
            <div className="seller-order-top">
              <div><small>ORDER REFERENCE</small><b>{order.id.slice(0, 8).toUpperCase()}</b></div>
              <span className={"seller-order-status status-" + order.status}>{label(order.status)}</span>
            </div>
            <div className="seller-order-date">{new Date(order.created_at).toLocaleString()}</div>
            <div className="seller-order-items">
              {(order.order_items ?? []).map(item => <div className="seller-order-item" key={item.id}>
                <Package size={17}/><span>{item.product_title} <small>× {item.quantity} · {item.shop_name || "Island Express seller"}</small></span>
                <b>SCR {(Number(item.unit_price_scr) * item.quantity).toLocaleString()}</b>
              </div>)}
            </div>
            <div className="seller-order-total"><span>Order total</span><b>SCR {Number(order.total_scr).toLocaleString()}</b></div>
            {(order.seller_order_fulfillments ?? []).length > 0 && <div className="seller-order-customer">
              <h3>Shipping updates</h3>
              {(order.seller_order_fulfillments ?? []).map((shipping, index) => <div key={shipping.shop_id || index} className="customer-shipping-update">
                <b>{shipping.status.replaceAll("_", " ")}</b>
                {shipping.courier && <span>Courier: {shipping.courier}</span>}
                {shipping.tracking_number && <span>Tracking number: {shipping.tracking_number}</span>}
                {shipping.estimated_delivery && <span>Estimated delivery: {new Date(shipping.estimated_delivery + "T00:00:00").toLocaleDateString()}</span>}
                {shipping.shipping_note && <span>{shipping.shipping_note}</span>}
                <small>Updated: {new Date(shipping.updated_at).toLocaleString()}</small>
              </div>)}
            </div>}
            <div className="seller-order-customer">
              <h3>Payment</h3>
              <b>{label(order.payment_status || "unpaid")}</b>
              <span>Paid by {order.payment_method === "stripe" ? "card" : label(order.payment_method)}</span>
            </div>
          </article>
        ))}</div>
      }
    </div>
  </main>;
}
