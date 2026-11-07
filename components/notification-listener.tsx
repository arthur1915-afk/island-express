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
};

export default function NotificationListener() {
  const [notice, setNotice] = useState<ToastNotification | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect(userId: string) {
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
          setNotice({ id: row.id, title: row.title, message: row.message, order_id: row.order_id });
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
        <Link href={notice.order_id ? "/notifications" : "/notifications"} onClick={() => setNotice(null)}>View notifications</Link>
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17}/></button>
    </div>
  );
}
