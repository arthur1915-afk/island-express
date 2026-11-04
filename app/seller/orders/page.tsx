"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft, Package, RefreshCw, ShoppingBag } from "lucide-react";

type OrderItem = { id: string; product_title: string; unit_price_scr: number; quantity: number; shop_name: string | null };
type Fulfilment = { id: string; shop_id: string; status: string; tracking_number: string | null; courier: string | null; estimated_delivery: string | null; shipping_note: string | null; updated_at: string };
type Order = {
  id: string; customer_name: string; phone: string; email: string | null; island: string;
  delivery_address: string; delivery_notes: string | null; subtotal_scr: number;
  delivery_fee_scr: number; total_scr: number; payment_method: string; status: string;
  created_at: string; order_items: OrderItem[]; seller_order_fulfillments: Fulfilment[];
};

export default function SellerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionBusy, setActionBusy] = useState("");

  async function loadOrders() {
    setLoading(true); setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "seller") { router.replace("/account"); return; }
    const { data: shops } = await supabase.from("shops").select("id").eq("owner_id", user.id).limit(1);
    const currentShopId = shops?.[0]?.id ?? "";
    setShopId(currentShopId);
    const { data, error } = await supabase.from("orders")
      .select("id,customer_name,phone,email,island,delivery_address,delivery_notes,subtotal_scr,delivery_fee_scr,total_scr,payment_method,status,created_at,order_items(id,product_title,unit_price_scr,quantity,shop_name),seller_order_fulfillments(id,shop_id,status,tracking_number,courier,estimated_delivery,shipping_note,updated_at)")
      .order("created_at", { ascending: false });
    if (error) setMessage(error.message);
    setOrders((data ?? []) as unknown as Order[]);
    setLoading(false);
  }

  useEffect(() => { loadOrders(); }, []);

  async function updateShipping(orderId: string, current?: Fulfilment) {
    const courier = window.prompt("Courier / delivery company:", current?.courier || "") ;
    if (courier === null) return;
    const tracking = window.prompt("Tracking number (leave blank if not available):", current?.tracking_number || "");
    if (tracking === null) return;
    const eta = window.prompt("Estimated delivery date (YYYY-MM-DD):", current?.estimated_delivery || "");
    if (eta === null) return;
    const note = window.prompt("Shipping update for the customer (optional):", current?.shipping_note || "");
    if (note === null) return;
    if (eta.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(eta.trim())) {
      setMessage("Enter the estimated delivery date as YYYY-MM-DD."); return;
    }
    setActionBusy(orderId); setMessage("");
    const { error } = await supabase.rpc("seller_update_shipping", {
      target_order_id: orderId,
      courier_name: courier.trim() || null,
      tracking: tracking.trim() || null,
      eta_date: eta.trim() || null,
      customer_note: note.trim() || null
    });
    if (error) setMessage(error.message);
    else setMessage("Shipping information updated. The customer can now see the latest details.");
    setActionBusy(""); await loadOrders();
  }

  async function fulfil(orderId: string, status: string) {
    if (status === "cancellation_requested" && !window.confirm("Request cancellation? Admin review will be required.")) return;
    let tracking: string | null = null;
    let courier: string | null = null;
    if (status === "shipped") {
      tracking = window.prompt("Enter the tracking number:");
      if (!tracking?.trim()) return;
      courier = window.prompt("Courier name (optional):") || null;
    }
    setActionBusy(orderId); setMessage("");
    const { error } = await supabase.rpc("seller_set_fulfilment", {
      target_order_id: orderId, next_status: status, tracking, courier_name: courier, note: null
    });
    if (error) setMessage(error.message);
    else setMessage(status === "cancellation_requested" ? "Cancellation request sent to admin." : "Order marked as shipped.");
    setActionBusy(""); await loadOrders();
  }

  return <main className="seller-dashboard">
    <header className="seller-dash-header">
      <Link href="/seller" className="account-back"><ArrowLeft size={16}/> Seller Centre</Link>
      <Link href="/" className="account-brand">island<span>express</span></Link>
    </header>
    <div className="seller-orders-wrap">
      <div className="seller-orders-heading">
        <div><div className="eyebrow">SELLER CENTRE</div><h1>Customer orders</h1><p>Orders that include products from your shop.</p></div>
        <button className="admin-refresh" onClick={loadOrders} disabled={loading}><RefreshCw size={15}/> Refresh</button>
      </div>
      {message && <div className="account-message">{message}</div>}
      {loading ? <div className="seller-order-empty">Loading orders…</div> :
        orders.length === 0 ? <div className="seller-order-empty"><ShoppingBag size={34}/><b>No orders yet</b><span>Orders containing your approved products will appear here.</span></div> :
        <div className="seller-order-list">{orders.filter(order => (order.order_items ?? []).length > 0).map(order => {
          const ownItems = order.order_items ?? [];
          const fulfilment = (order.seller_order_fulfillments ?? []).find(item => item.shop_id === shopId);
          const sellerStatus = fulfilment?.status || "new";
          return <article className="seller-order-card" key={order.id}>
            <div className="seller-order-top"><div><small>ORDER REFERENCE</small><b>{order.id.slice(0, 8).toUpperCase()}</b></div><span className={"seller-order-status status-" + sellerStatus}>{sellerStatus.replaceAll("_", " ")}</span></div>
            <div className="seller-order-date">{new Date(order.created_at).toLocaleString()}</div>
            <div className="seller-order-items">{ownItems.map(item => <div className="seller-order-item" key={item.id}><Package size={17}/><span>{item.product_title} <small>× {item.quantity}</small></span><b>SCR {(Number(item.unit_price_scr) * item.quantity).toLocaleString()}</b></div>)}</div>
            <div className="seller-order-total"><span>Your items subtotal</span><b>SCR {ownItems.reduce((sum,item)=>sum+Number(item.unit_price_scr)*item.quantity,0).toLocaleString()}</b></div>
            <div className="seller-order-customer"><h3>Delivery details</h3><b>{order.customer_name}</b><span>{order.phone}{order.email ? " · " + order.email : ""}</span><span>{order.delivery_address}, {order.island}</span>{order.delivery_notes && <small>Note: {order.delivery_notes}</small>}</div>
            <div className="seller-order-payment">Payment: {order.payment_method === "cash_on_delivery" ? "Cash on delivery / arrange with seller" : order.payment_method}</div>
            {(fulfilment?.tracking_number || fulfilment?.courier) && <div className="seller-order-payment">Shipping: {fulfilment.courier || "Courier not specified"}{fulfilment.tracking_number ? " · Tracking: " + fulfilment.tracking_number : ""}</div>}
            {fulfilment?.estimated_delivery && <div className="seller-order-payment">Estimated delivery: {new Date(fulfilment.estimated_delivery + "T00:00:00").toLocaleDateString()}</div>}
            {fulfilment?.shipping_note && <div className="seller-order-payment">Customer update: {fulfilment.shipping_note}</div>}
            <div className="seller-order-actions">
              {(!fulfilment || sellerStatus === "processing") && <button disabled={actionBusy===order.id} onClick={()=>fulfil(order.id,"shipped")}>Mark as shipped</button>}
              {(!fulfilment || sellerStatus === "new" || sellerStatus === "processing") && <button className="seller-cancel-action" disabled={actionBusy===order.id} onClick={()=>fulfil(order.id,"cancellation_requested")}>Request cancellation</button>}
              {sellerStatus === "shipped" && <span className="seller-order-payment">Awaiting delivery confirmation</span>}
              {sellerStatus === "cancellation_requested" && <span className="seller-order-payment">Cancellation awaiting admin review</span>}
            </div>
          </article>;
        })}</div>}
    </div>
  </main>;
}
