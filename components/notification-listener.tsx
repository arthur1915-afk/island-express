"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type ToastNotification = {
  id: string;
  title: string;
  message: string;
  order_id: string | null;
  notification_type: string;
  href: string;
  linkLabel: string;
};

export default function NotificationListener() {
  const [notice, setNotice] = useState<ToastNotification | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect(userId: string) {
      const destination = profile?.is_admin ? "/admin" : profile?.role === "seller" ? "/seller/orders" : "/orders";
      const destinationLabel = profile?.is_admin ? "Open Admin Centre" : profile?.role === "seller" ? "View customer orders" : "View My Orders";
      if (channel) await supabase.removeChannel(channel);
      channel = supabase
        .channel("live-notifications-" + userId)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + userId
        }, payload => {
          const row = payload.new as ToastNotification;
          if (!active) return;
          const isSellerOrder = row.notification_type?.startsWith("new_order:");
          const isAdminAlert = row.notification_type?.startsWith("admin_") || row.notification_type?.includes("cancellation_request");
          const destination = isSellerOrder ? "/seller/orders" : isAdminAlert ? "/admin" : "/orders";
          const destinationLabel = isSellerOrder ? "View customer orders" : isAdminAlert ? "Open Admin Centre" : "View My Orders";
          setNotice({ id: row.id, title: row.title, message: row.message, order_id: row.order_id, notification_type: row.notification_type, href: destination, linkLabel: destinationLabel });
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => setNotice(null), 9000);
        })
        .subscribe();
    }

    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) void connect(data.user.id);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void connect(session.user.id);
      else if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
        setNotice(null);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      if (hideTimer) clearTimeout(hideTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  if (!notice) return null;
  return (
    <div className="live-notification-toast" role="status" aria-live="polite">
      <span className="live-notification-icon"><Bell size={19} /></span>
      <div className="live-notification-copy">
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
        <Link href={notice.href} onClick={() => setNotice(null)}>{notice.linkLabel}</Link>
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17}/></button>
    </div>
  );
}
