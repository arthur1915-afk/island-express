"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export default function AdminLogin(){
 const router=useRouter();
 const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function login(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
   if(error)throw error;
   const {data:profile,error:profileError}=await supabase.from("profiles").select("is_admin").eq("id",data.user.id).single();
   if(profileError||!profile?.is_admin){await supabase.auth.signOut();throw new Error("This account is not authorised for administration.");}
   router.replace("/admin");
  }catch(err){setMessage(err instanceof Error?err.message:"Unable to sign in.");}
  finally{setBusy(false);}
 }
 return <main className="account-page"><div className="account-top"><Link href="/" className="account-back"><ArrowLeft size={17}/> Marketplace</Link><span className="account-brand">island<span>express</span></span></div>
 <section className="account-card admin-login-card"><div className="account-icon"><ShieldCheck size={26}/></div><div className="eyebrow">RESTRICTED AREA</div>
 <h1>Admin sign in</h1><p className="account-sub">Sign in with the email address and password provided for your administrator account.</p>
 <form className="account-form" onSubmit={login}><label>Administrator email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label><button className="primary account-submit" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form>
 {message&&<div className="account-message" role="alert">{message}</div>}
 </section></main>;
}