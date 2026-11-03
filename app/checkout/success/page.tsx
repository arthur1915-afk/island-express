"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";

export default function CheckoutSuccessPage() {
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setChecking(false), 2500);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="checkout-page"><div className="cart-empty">
    <CheckCircle2 size={44}/><h1>Thank you for your payment</h1>
    <p>Your payment is being confirmed securely. Your order will be marked as paid once Stripe sends its confirmation.</p>
    {checking && <p><Clock3 size={15}/> Checking payment status…</p>}
    <Link href="/account" className="primary">Go to my account</Link>
    <Link href="/" className="secondary">Continue shopping</Link>
  </div></main>;
}
