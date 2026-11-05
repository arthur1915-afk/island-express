"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setReady(true);
        if (!data.session) setMessage("This password reset link is invalid or has expired. Please request a new one.");
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setMessage("");
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Your new password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    router.replace("/account?password=updated");
  }

  return (
    <main className="account-page">
      <div className="account-top">
        <Link href="/account" className="account-back"><ArrowLeft size={17}/> Back to login</Link>
        <span className="account-brand">island<span>express</span></span>
      </div>
      <section className="account-card">
        <div className="account-icon"><LockKeyhole size={25}/></div>
        <div className="eyebrow">ACCOUNT SECURITY</div>
        <h1>Set a new password</h1>
        <p className="account-sub">Choose a new password for your Island Express account.</p>
        {ready && !message.startsWith("This password reset link") ? (
          <form onSubmit={updatePassword} className="account-form">
            <label>New password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
            <label>Confirm new password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter the password again"/></label>
            <button className="primary account-submit" disabled={busy}>{busy ? "Updating password…" : "Update password"}</button>
          </form>
        ) : null}
        {message && <div className="account-message" role="status">{message}</div>}
        <p className="account-sub"><Link href="/account">Return to Island Express login</Link></p>
      </section>
    </main>
  );
}
