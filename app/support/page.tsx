"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, Bot, Headset, Send, UserRound, MessageCircle, LoaderCircle } from "lucide-react";

type Conversation = { id: string; subject: string; status: string; handoff_requested: boolean; created_at: string };
type Message = { id: string; sender_type: "customer" | "ai" | "admin"; body: string; created_at: string };

export default function SupportPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refreshList() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/account"); return; }
    setUserId(session.user.id); setToken(session.access_token);
    const { data, error } = await supabase.from("support_conversations").select("id,subject,status,handoff_requested,created_at").eq("customer_id", session.user.id).order("updated_at", { ascending: false });
    if (error) setNotice(error.message);
    setConversations((data ?? []) as Conversation[]);
    setLoading(false);
  }

  async function loadMessages(id: string) {
    setActive(id);
    const { data, error } = await supabase.from("support_messages").select("id,sender_type,body,created_at").eq("conversation_id", id).order("created_at", { ascending: true });
    if (error) setNotice(error.message);
    setMessages((data ?? []) as Message[]);
  }

  useEffect(() => { refreshList(); }, []);

  async function createConversation(e: FormEvent) {
    e.preventDefault(); if (!subject.trim()) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.from("support_conversations").insert({ customer_id: userId, subject: subject.trim(), category }).select("id,subject,status,handoff_requested,created_at").single();
    if (error || !data) setNotice(error?.message || "Unable to open a support request.");
    else {
      setSubject(""); setConversations(old => [data as Conversation, ...old]); await loadMessages(data.id);
      setNotice("Your support conversation is open. Ask the AI assistant a question, or request a human agent.");
    }
    setBusy(false);
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault(); if (!draft.trim() || !active || busy) return;
    const text = draft.trim(); setDraft(""); setBusy(true); setNotice("");
    const { data, error } = await supabase.from("support_messages").insert({ conversation_id: active, sender_id: userId, sender_type: "customer", body: text }).select("id,sender_type,body,created_at").single();
    if (error || !data) { setNotice(error?.message || "Message could not be sent."); setDraft(text); setBusy(false); return; }
    setMessages(old => [...old, data as Message]);
    const { data: conversation } = await supabase.from("support_conversations").select("handoff_requested,status").eq("id", active).single();
    if (conversation?.handoff_requested || conversation?.status === "waiting_for_support" || conversation?.status === "in_progress") {
      setNotice("Your message has been sent to Customer Care.");
      setBusy(false); return;
    }
    try {
      const response = await fetch("/api/customer-care/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ conversationId: active }) });
      const result = await response.json();
      if (!response.ok) setNotice(result.error || "AI assistant is unavailable. You can request a human agent.");
      else if (result.reply) {
        setMessages(old => [...old, { id: crypto.randomUUID(), sender_type: "ai", body: result.reply, created_at: new Date().toISOString() }]);
        if (result.handoff) setNotice("Your conversation has been transferred to Customer Care.");
      }
      await refreshList();
    } catch { setNotice("The assistant could not be reached. Please try again or request a human agent."); }
    setBusy(false);
  }

  async function requestHuman() {
    if (!active || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.from("support_conversations").update({ handoff_requested: true, status: "waiting_for_support" }).eq("id", active);
    if (error) setNotice(error.message);
    else {
      const { error: msgError } = await supabase.from("support_messages").insert({ conversation_id: active, sender_id: userId, sender_type: "customer", body: "I'd like to speak to a human Customer Care agent, please." });
      if (msgError) setNotice(msgError.message);
      else { setNotice("Your conversation has been transferred to human Customer Care."); await loadMessages(active); await refreshList(); }
    }
    setBusy(false);
  }

  if (loading) return <main className="support-page"><div className="support-shell">Loading Customer Care…</div></main>;
  return <main className="support-page">
    <header className="support-top"><Link href="/" className="account-back"><ArrowLeft size={16}/> Marketplace</Link><span className="account-brand">island<span>express</span></span></header>
    <div className="support-shell">
      <div className="support-heading"><div className="support-bot-icon"><Headset size={25}/></div><div><div className="eyebrow">ISLAND EXPRESS HELP</div><h1>Customer Care</h1><p>Ask our AI assistant. If you need more help, we'll connect you with our team.</p></div></div>
      <div className="support-layout">
        <aside className="support-sidebar"><h2>Your conversations</h2><form onSubmit={createConversation} className="support-new-form"><input required minLength={3} maxLength={140} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What do you need help with?"/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="general">General question</option><option value="orders">Orders</option><option value="payments">Payments</option><option value="delivery">Delivery</option><option value="returns_refunds">Returns & refunds</option><option value="account">Account</option><option value="products">Products</option><option value="other">Other</option></select><button className="primary" disabled={busy}>{busy?"Opening…":"Start a conversation"}</button></form>
          <div className="support-conversation-list">{conversations.map(c=><button key={c.id} className={active===c.id?"active":""} onClick={()=>loadMessages(c.id)}><b>{c.subject}</b><small>{c.status.replaceAll("_"," ")}</small></button>)}{!conversations.length&&<p>No support conversations yet.</p>}</div>
        </aside>
        <section className="support-chat">
          {!active ? <div className="support-chat-empty"><MessageCircle size={38}/><b>How can we help?</b><span>Start a conversation to chat with Island Express Customer Care.</span></div> : <>
            <div className="support-chat-bar"><span><Bot size={18}/> Island Express AI Assistant</span><button onClick={requestHuman} disabled={busy}><Headset size={15}/> Talk to a human</button></div>
            <div className="support-messages">{messages.map(m=><div key={m.id} className={"support-message "+m.sender_type}><span className="support-message-avatar">{m.sender_type==="customer"?<UserRound size={15}/>:m.sender_type==="ai"?<Bot size={15}/>:<Headset size={15}/>}</span><div><small>{m.sender_type==="customer"?"You":m.sender_type==="ai"?"AI Assistant":"Customer Care"}</small><p>{m.body}</p></div></div>)}{busy&&<div className="support-typing"><LoaderCircle size={15}/> Customer Care is preparing a reply…</div>}</div>
            <form className="support-compose" onSubmit={sendMessage}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type your question…" maxLength={5000}/><button disabled={busy||!draft.trim()} aria-label="Send message"><Send size={17}/></button></form>
          </>}
          {notice&&<div className="support-notice">{notice}</div>}
        </section>
      </div>
    </div>
  </main>;
}
