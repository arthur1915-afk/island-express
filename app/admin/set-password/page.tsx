"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { ShieldCheck, LockKeyhole } from "lucide-react";

export default function AdminSetPasswordPage() {
  const router = useRouter();
  const [password,setPassword] = useState("");
  const [confirmPassword,setConfirmPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  const [complete,setComplete] = useState(false);
  const [message,setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({data,error}) => {
      if (error || !data.session) setMessage("This invitation link is invalid or has expired. Ask an administrator to send a new invitation.");
      else setReady(true);
    });
  }, []);

  async function savePassword(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(password.length < 8) { setMessage("Use a password with at least 8 characters."); return; }
    if(password !== confirmPassword) { setMessage("The passwords do not match."); return; }
    setBusy(true);setMessage("");
    const {error}=await supabase.auth.updateUser({password});
    if(error) setMessage(error.message);
    else {setComplete(true);setMessage("Your password has been set. You can now sign in to the Admin Centre.");}
    setBusy(false);
  }

  return <main className="account-page"><section className="account-card admin-login-card">
    <div className="account-icon"><ShieldCheck size={26}/></div><div className="eyebrow">ISLAND EXPRESS ADMIN</div>
    <h1>Set your password</h1>
    <p className="account-sub">Choose a password for your administrator account.</p>
    {!ready && !complete && <div className="account-message">{message || "Checking your invitation…"}</div>}
    {ready && !complete && <form className="account-form" onSubmit={savePassword}>
      <label>New password<input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
      <label>Confirm password<input type="password" minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter password again"/></label>
      <button className="primary account-submit" disabled={busy}><LockKeyhole size={15}/>{busy?"Saving…":"Set password"}</button>
    </form>}
    {message && (ready || complete) && <div className="account-message" role="status">{message}</div>}
    {complete && <button className="primary account-submit" onClick={async()=>{await supabase.auth.signOut();router.push("/admin/login");}}>Go to Admin sign in</button>}
    <Link href="/admin/login" className="account-back">Back to Admin sign in</Link>
  </section></main>;
}
