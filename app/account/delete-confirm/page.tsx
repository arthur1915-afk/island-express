"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export default function ConfirmAccountDeletionPage() {
  const started = useRef(false);
  const [message, setMessage] = useState("Verifying your email confirmation…");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function confirm() {
      const token = new URLSearchParams(window.location.search).get("token") || "";
      if (!token) {
        setMessage("This confirmation link is missing its security token. Please request a new deletion email from your account settings.");
        return;
      }
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setMessage("The email confirmation could not be verified. Please request a new deletion link and open it again.");
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Your email link has been opened, but we could not establish your Island Express session. Please open the link again in the same browser where you use Island Express, or request a new link.");
        return;
      }
      const response = await fetch("/api/account/delete-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "We could not confirm account deletion.");
        return;
      }
      setSuccess(true);
      setMessage("Your account deletion has been confirmed. Your sign-in has been disabled and your personal account details have been anonymised. Essential order records are retained for business and legal record-keeping.");
      await supabase.auth.signOut();
    }
    confirm().catch(() => setMessage("Something went wrong while confirming account deletion. Please contact Customer Care."));
  }, []);

  return <main className="account-page"><section className="account-card" style={{maxWidth:620,margin:"8vh auto",padding:32}}>
    <div className="eyebrow">ISLAND EXPRESS ACCOUNT</div>
    <h1>{success ? "Account deletion confirmed" : "Confirm account deletion"}</h1>
    <p role="status">{message}</p>
    <Link className="primary account-shop-button" href="/">{success ? "Return to Island Express" : "Back to Island Express"}</Link>
  </section></main>;
}
