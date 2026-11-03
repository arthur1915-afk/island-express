"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { ShieldCheck, LockKeyhole, ArrowLeft } from "lucide-react";

type Factor = { id:string; status:string; factor_type:string };
export default function AdminLogin(){
 const router=useRouter();
 const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
 const [code,setCode]=useState(""); const [secret,setSecret]=useState(""); const [factorId,setFactorId]=useState("");
 const [challengeId,setChallengeId]=useState(""); const [stage,setStage]=useState<"login"|"mfa"|"enroll">("login");
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function continueWithMfa(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage("Please sign in again.");return;}
  const {data:profile,error}=await supabase.from("profiles").select("is_admin").eq("id",user.id).single();
  if(error||!profile?.is_admin){await supabase.auth.signOut();setMessage("This account is not authorised for administration.");return;}
  const {data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal?.currentLevel==="aal2"){router.replace("/admin");return;}
  const {data,error:listError}=await supabase.auth.mfa.listFactors();
  if(listError)throw listError;
  const verified=(data.totp??[]).find((f:Factor)=>f.status==="verified");
  if(verified){
   const {data:challenge,error}=await supabase.auth.mfa.challenge({factorId:verified.id});
   if(error)throw error;
   setFactorId(verified.id);setChallengeId(challenge.id);setStage("mfa");
  }else{
   const {data:enrollment,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"Island Express Admin"});
   if(error)throw error;
   setFactorId(enrollment.id);setSecret(enrollment.totp.secret);setStage("enroll");
  }
 }
 async function login(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;await continueWithMfa();}
  catch(err){setMessage(err instanceof Error?err.message:"Unable to sign in.");}
  finally{setBusy(false);}
 }
 async function verify(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   let challenge=challengeId;
   if(stage==="enroll"){
    const {data,error}=await supabase.auth.mfa.challenge({factorId});if(error)throw error;challenge=data.id;
   }
   const {error}=await supabase.auth.mfa.verify({factorId,challengeId:challenge,code:code.trim()});if(error)throw error;
   router.replace("/admin");
  }catch(err){setMessage(err instanceof Error?err.message:"The authenticator code could not be verified.");}
  finally{setBusy(false);}
 }
 return <main className="account-page"><div className="account-top"><Link href="/" className="account-back"><ArrowLeft size={17}/> Marketplace</Link><span className="account-brand">island<span>express</span></span></div>
 <section className="account-card admin-login-card"><div className="account-icon"><ShieldCheck size={26}/></div><div className="eyebrow">RESTRICTED AREA</div>
 <h1>Admin sign in</h1><p className="account-sub">This portal is reserved for authorised Island Express administrators.</p>
 {stage==="login"&&<form className="account-form" onSubmit={login}><label>Administrator email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label><button className="primary account-submit" disabled={busy}>{busy?"Checking…":"Continue securely"}</button></form>}
 {stage==="enroll"&&<form className="account-form" onSubmit={verify}><div className="account-message">Set up an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password. Add an account manually using this secret:</div><label>Authenticator setup key<input readOnly value={secret}/></label><label>6-digit authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} placeholder="000000"/></label><button className="primary account-submit" disabled={busy}>{busy?"Verifying…":"Enable 2FA and enter Admin Centre"}</button></form>}
 {stage==="mfa"&&<form className="account-form" onSubmit={verify}><div className="account-message">Enter the current 6-digit code from your authenticator app.</div><label>Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} placeholder="000000"/></label><button className="primary account-submit" disabled={busy}>{busy?"Verifying…":"Verify and continue"}</button></form>}
 {message&&<div className="account-message" role="alert">{message}</div>}
 </section></main>;
}