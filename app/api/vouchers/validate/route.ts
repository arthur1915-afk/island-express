import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
    if(!supabaseUrl||!serviceKey||!anonKey||!token) return NextResponse.json({error:"Please sign in again."},{status:401});
    const auth=createClient(supabaseUrl,anonKey);
    const {data:{user},error:authError}=await auth.auth.getUser(token);
    if(authError||!user) return NextResponse.json({error:"Your session is invalid."},{status:401});
    const {code,items}=await request.json();
    if(typeof code!=="string"||!code.trim()||!Array.isArray(items)||!items.length) return NextResponse.json({error:"Enter a voucher code and add items to your cart."},{status:400});
    const db=createClient(supabaseUrl,serviceKey);
    const ids=items.map((x:any)=>x.id).filter((x:any)=>typeof x==="string");
    if(!ids.length) return NextResponse.json({error:"Invalid cart."},{status:400});
    const {data:products,error}=await db.from("products").select("id,price_scr,shop_id,shops(name)").in("id",ids).eq("status","approved");
    if(error||!products||products.length!==new Set(ids).size) return NextResponse.json({error:"Some cart items are no longer available."},{status:400});
    const qty=new Map(items.map((x:any)=>[x.id,Math.max(1,Math.floor(Number(x.quantity)||1))]));
    const groups=new Map<string,{subtotal:number;name:string}>();
    for(const p of products){const g=groups.get(p.shop_id)||{subtotal:0,name:(p.shops as any)?.name||"Seller"};g.subtotal+=Number(p.price_scr)*(qty.get(p.id)||1);groups.set(p.shop_id,g);}
    const {data:vouchers,error:vError}=await db.from("shop_vouchers").select("id,shop_id,code,title,discount_type,discount_value,minimum_spend_scr,starts_at,ends_at,max_redemptions,redemption_count,is_active").ilike("code",code.trim()).eq("is_active",true);
    if(vError||!vouchers?.length) return NextResponse.json({error:"That voucher code was not found or is inactive."},{status:400});
    const now=Date.now();
    const match=vouchers.find(v=>groups.has(v.shop_id)&&now>=new Date(v.starts_at).getTime()&&(!v.ends_at||now<=new Date(v.ends_at).getTime())&&groups.get(v.shop_id)!.subtotal>=Number(v.minimum_spend_scr)&&(v.max_redemptions===null||v.redemption_count<v.max_redemptions));
    if(!match) return NextResponse.json({error:"This voucher is expired, has reached its limit, or its minimum spend is not met for the issuing shop."},{status:400});
    const subtotal=groups.get(match.shop_id)!.subtotal;
    const discount= Math.min(subtotal,match.discount_type==="percentage"?subtotal*Number(match.discount_value)/100:Number(match.discount_value));
    return NextResponse.json({valid:true,code:match.code,title:match.title,shop:groups.get(match.shop_id)!.name,discount:Number(discount.toFixed(2)),subtotal:Number(subtotal.toFixed(2))});
  } catch { return NextResponse.json({error:"Could not validate this voucher."},{status:500}); }
}
