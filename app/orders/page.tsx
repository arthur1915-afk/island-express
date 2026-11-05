"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, RefreshCw, ShoppingBag, Star, CreditCard, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

type OrderItem = {
  id: string;
  product_id: string | null;
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
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [reviewProduct, setReviewProduct] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);\n  const [actionOrder, setActionOrder] = useState<string | null>(null);

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
    const { data: reviews } = await supabase.from("product_reviews").select("product_id").eq("customer_id", user.id);
    setReviewed((reviews ?? []).map((r: { product_id: string }) => r.product_id));
    setLoading(false);
  }

  async function payAgain(orderId: string) {
    setActionOrder(orderId); setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "Could not restart payment.");
      window.location.href = result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restart payment.");
      setActionOrder(null);
    }
  }

  async function cancelUnpaidOrder(orderId: string) {
    if (!window.confirm("Cancel this unpaid order? You will not be charged.")) return;
    setActionOrder(orderId); setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not cancel this order.");
      await loadOrders();
      setMessage("Your unpaid order has been cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not cancel this order.");
    } finally {
      setActionOrder(null);
    }
  }

  useEffect(() => { loadOrders(); }, []);

  async function confirmReceived(orderId: string, shopId: string) {
    if (!window.confirm("Have you received this delivery? Confirming will complete it and release the seller's eligible funds.")) return;
    setMessage("");
    const { error } = await supabase.rpc("customer_confirm_order_received", { target_order_id: orderId, target_shop_id: shopId });
    if (error) setMessage(error.message);
    else setMessage("Receipt confirmed. Thank you!");
    await loadOrders();
  }

  async function submitReview(orderId:string, productId:string) {
    if (!reviewBody.trim()) { setMessage("Please write a short review before submitting."); return; }
    setReviewBusy(true); setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("Please sign in again."); setReviewBusy(false); return; }
    const { error } = await supabase.from("product_reviews").insert({ order_id:orderId, product_id:productId, customer_id:user.id, rating:reviewRating, title:reviewTitle.trim() || null, body:reviewBody.trim(), status:"pending" });
    if (error) setMessage(error.message);
    else { setReviewed(old => [...old, productId]); setReviewProduct(null); setReviewTitle(""); setReviewBody(""); setMessage("Thank you! Your review has been submitted for approval."); }
    setReviewBusy(false);
  }

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
                {order.status === "completed" && item.product_id && (reviewed.includes(item.product_id) ? <span className="review-submitted">Review submitted</span> : <button className="review-open-button" onClick={() => { setReviewProduct(reviewProduct === item.product_id ? null : item.product_id); setReviewRating(5); }}><Star size={14}/> Write a review</button>)}
                {reviewProduct === item.product_id && order.status === "completed" && item.product_id && <div className="review-form">
                  <div className="review-rating-picker">{[1,2,3,4,5].map(n=><button type="button" key={n} onClick={()=>setReviewRating(n)} aria-label={n+" stars"}><Star size={19} fill={n<=reviewRating?"currentColor":"none"}/></button>)}</div>
                  <input value={reviewTitle} onChange={e=>setReviewTitle(e.target.value)} placeholder="Review title (optional)" maxLength={100}/>
                  <textarea value={reviewBody} onChange={e=>setReviewBody(e.target.value)} placeholder="Share your experience (at least 5 characters)" maxLength={2000}/>
                  <button disabled={reviewBusy||reviewBody.trim().length<5} onClick={()=>submitReview(order.id,item.product_id!)}>{reviewBusy?"Submitting…":"Submit review"}</button>
                </div>}
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
                {shipping.shipping_note && <span>{shipping.shipping_note}</span>}{shipping.status === "delivered" && <button className="review-open-button" onClick={() => confirmReceived(order.id, shipping.shop_id)}>Confirm order received</button>}{shipping.status === "completed" && <span className="review-submitted">Receipt confirmed</span>}
                <small>Updated: {new Date(shipping.updated_at).toLocaleString()}</small>
              </div>)}
            </div>}
            <div className="seller-order-customer">
              <h3>Payment</h3>
              <b>{order.status === "pending" && order.payment_status !== "paid" ? "Awaiting payment" : label(order.payment_status || "unpaid")}</b>
              <span>Paid by {order.payment_method === "stripe" ? "card" : label(order.payment_method)}</span>
              {order.status === "pending" && order.payment_status !== "paid" && <div className="unpaid-order-actions">
                <p>Your payment was not completed. You can try again or cancel this order.</p>
                <button className="primary" disabled={actionOrder === order.id} onClick={() => payAgain(order.id)}><CreditCard size={15}/>{actionOrder === order.id ? "Please wait…" : "Pay again"}</button>
                <button className="unpaid-cancel-button" disabled={actionOrder === order.id} onClick={() => cancelUnpaidOrder(order.id)}><XCircle size={15}/>Cancel order</button>
              </div>}
              {order.status === "cancelled" && <span>This order was cancelled and cannot be paid.</span>}
            </div>
          </article>
        ))}</div>
      }
    </div>
  </main>;
}
