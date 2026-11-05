"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, CheckCheck, Package, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Notification = { id: string; order_id: string | null; notification_type: string; title: string; message: string; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadNotifications() {
    setLoading(true); setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account?mode=login"); return; }
    const { data, error } = await supabase.from("notifications").select("id,order_id,notification_type,title,message,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) setMessage(error.message);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }

  useEffect(() => { loadNotifications(); }, []);

  async function markRead(id: string) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("id", id);
    if (error) setMessage(error.message);
    else setItems(old => old.map(item => item.id === id ? { ...item, read_at: now } : item));
  }

  async function markAllRead() {
    setBusy(true); setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/account?mode=login"); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
    if (error) setMessage(error.message);
    else setItems(old => old.map(item => ({ ...item, read_at: item.read_at || now })));
    setBusy(false);
  }

  const unread = items.filter(item => !item.read_at).length;
  return <main className="cart-page">
    <header className="cart-page-header"><Link href="/" className="account-brand">island<span>express</span></Link><span>YOUR ACCOUNT</span></header>
    <div className="cart-page-wrap">
      <Link href="/account" className="cart-back"><ArrowLeft size={16}/> My account</Link>
      <div className="seller-orders-heading"><div><div className="eyebrow">CUSTOMER CENTRE</div><h1>Notifications</h1><p>Order confirmations, delivery updates and seller cancellation notices.</p></div><button className="admin-refresh" onClick={loadNotifications} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      {message && <div className="account-message">{message}</div>}
      <div className="notifications-actions"><span>{unread} unread</span><button onClick={markAllRead} disabled={busy || unread === 0}><CheckCheck size={14}/> Mark all as read</button></div>
      {loading ? <div className="seller-order-empty">Loading notifications…</div> : items.length === 0 ? <div className="notifications-empty"><Bell size={32}/><b>You’re all caught up</b><p>Updates about your orders will appear here.</p></div> : <div className="notifications-list">{items.map(item => <div className={"notification-card" + (!item.read_at ? " unread" : "")} key={item.id}>
        <span className="notification-icon"><Package size={18}/></span><div className="notification-copy"><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small><div><Link href={item.order_id ? "/orders" : "/orders"} onClick={()=>{if(!item.read_at) void markRead(item.id);}} className="review-open-button">View My Orders</Link></div></div>{!item.read_at && <span className="notification-unread-dot" aria-label="Unread"/>}
      </div>)}</div>}
    </div>
  </main>;
}
