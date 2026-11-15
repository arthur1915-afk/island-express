import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
const allowed = ["aliexpress.com","shein.com","iherb.com","asos.com","alibaba.com"];
function platform(host:string){return allowed.find(d=>host===d||host.endsWith("."+d))||null;}
function meta(html:string,key:string,attr="property"){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const a=new RegExp(`<meta[^>]+${attr}=[\"']${escaped}[\"'][^>]+content=[\"']([^\"']*)[\"'][^>]*>`,"i");const b=new RegExp(`<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+${attr}=[\"']${escaped}[\"'][^>]*>`,"i");const m=html.match(a)||html.match(b);return (m?.[1]||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').trim();}
function collect(value:any,out:any[]){if(!value||typeof value!=="object")return;if(Array.isArray(value)){value.forEach(v=>collect(v,out));return;}const types=Array.isArray(value["@type"])?value["@type"]:[value["@type"]];if(types.some((t:any)=>String(t).toLowerCase()==="product"))out.push(value);for(const [k,v] of Object.entries(value)){if(k!=="@type"&&v&&typeof v==="object")collect(v,out);}}
function imageCandidates(html:string,product:any){
 const found:string[]=[];
 const add=(v:any)=>{if(typeof v==="string"){const s=v.replace(/&amp;/g,"&").replace(/\\u0026/gi,"&").trim();const u=s.startsWith("//")?"https:"+s:s;if(u.startsWith("https://")&&!/(sprite|logo|icon|avatar|placeholder)/i.test(u))found.push(u);}else if(Array.isArray(v))v.forEach(add);else if(v&&typeof v==="object"){add(v.url);add(v.contentUrl);}};
 add(product?.image);add(product?.images);
 const metaTags=html.match(/<meta\b[^>]*>/gi)||[];
 for(const tag of metaTags){if(/(?:og:image|twitter:image)/i.test(tag)){const m=tag.match(/content=["']([^"']+)["']/i);if(m)add(m[1]);}}
 const imageTags=html.match(/<(?:img|source)\b[^>]*>/gi)||[];
 for(const tag of imageTags){const attrs=tag.matchAll(/(?:src|data-src|data-original|data-lazy-src|data-zoom-image|srcset)=["']([^"']+)["']/gi);for(const a of attrs)add(a[1].split(",")[0].trim().split(/\s+/)[0]);}
 const urls=html.match(/https:\/\/[^"'<> ]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'<> ]*)?/gi)||[];
 urls.forEach(add);
 return [...new Set(found)].slice(0,12);
}
export async function POST(request:NextRequest){try{
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return NextResponse.json({error:"Sign in as an administrator."},{status:401});
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,a=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,s=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!a||!s)return NextResponse.json({error:"Admin importer is not configured."},{status:500});
 const auth=createClient(u,a,{auth:{persistSession:false,autoRefreshToken:false}});const {data:{user}}=await auth.auth.getUser(token);if(!user)return NextResponse.json({error:"Session expired."},{status:401});
 const db=createClient(u,s,{auth:{persistSession:false,autoRefreshToken:false}});const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).single();if(!profile?.is_admin)return NextResponse.json({error:"Administrator access required."},{status:403});
 const body=await request.json();const parsed=new URL(String(body.url||""));if(parsed.protocol!=="https:"||!platform(parsed.hostname.toLowerCase()))return NextResponse.json({error:"Use an HTTPS product URL from AliExpress, SHEIN, iHerb, ASOS or Alibaba."},{status:400});
 if(platform(parsed.hostname.toLowerCase())==="aliexpress.com"){
  const apiKey=process.env.ALIEXPRESS_SCRAPER_API_KEY;
  if(!apiKey)return NextResponse.json({error:"AliExpress blocks direct server extraction. Connect the free AliExpress Scraper API key in Vercel to enable reliable product imports. The other suppliers still use page extraction."},{status:503});
  const apiUrl=new URL("https://aliexpress-scraper-api.omkar.cloud/aliexpress/v2/product");
  apiUrl.searchParams.set("product",parsed.toString());apiUrl.searchParams.set("country_code","MY");
  const apiResponse=await fetch(apiUrl.toString(),{headers:{"API-Key":apiKey,Accept:"application/json"},signal:AbortSignal.timeout(30000)});
  const apiData=await apiResponse.json().catch(()=>null);
  if(!apiResponse.ok||!apiData||apiData.error)throw new Error(apiData?.error||"AliExpress product service could not retrieve this listing. Check the product URL or API quota.");
  const sourcePrice=Number(apiData.pricing?.sale_price);
  const sourceCurrency=String(apiData.pricing?.currency||"").toUpperCase();
  const images=(Array.isArray(apiData.images)?apiData.images:[]).filter((v:any)=>typeof v==="string"&&/^https:\/\//i.test(v)).slice(0,8);
  const specifications=Array.isArray(apiData.specifications)?apiData.specifications:[];
  const description=String(apiData.description||apiData.product_description||specifications.map((s:any)=>s?.name&&s?.value?String(s.name)+": "+String(s.value):"").filter(Boolean).join("\\n"));
  let fx:any=null;
  if(sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0){const fr=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(sourceCurrency),{signal:AbortSignal.timeout(8000)});if(fr.ok){const fd=await fr.json();const rate=Number(fd?.rates?.SCR);if(fd?.result==="success"&&rate>0)fx={rate,provider:"open.er-api.com",updated:fd.time_last_update_utc};}}
  const rate=fx?.rate||null;const costScr=rate?Math.round(sourcePrice*rate*100)/100:null;
  const shippingOptions=Array.isArray(apiData.shipping?.options)?apiData.shipping.options:[];
  const shippingOption=shippingOptions.find((s:any)=>Number.isFinite(Number(s.price))&&String(s.currency||sourceCurrency).toUpperCase()===sourceCurrency);
  return NextResponse.json({platform:"aliexpress.com",sourceUrl:parsed.toString(),title:String(apiData.title||""),description,images,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*1.2*100)/100,fx,shipping:null,shippingMessage:shippingOption?"Supplier shipping options were found, but not confirmed for Seychelles. Enter a Seychelles delivery fee manually.":"AliExpress did not return a verified Seychelles shipping quote. Enter the delivery fee manually.",supplierDataSource:"AliExpress Scraper API",variants:Array.isArray(apiData.skus)?apiData.skus:[],specifications});
 }
 const response=await fetch(parsed.toString(),{headers:{"User-Agent":"Mozilla/5.0 (compatible; IslandExpressProductPreview/1.0)",Accept:"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(12000),redirect:"follow"});if(!response.ok)throw new Error("Supplier page could not be accessed. Enter product details manually.");
 const html=(await response.text()).slice(0,2500000);const products:any[]=[];const scripts=[...html.matchAll(/<script[^>]*type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/gi)];for(const m of scripts){try{collect(JSON.parse(m[1]),products);}catch{}}
 const p=products[0]||{};const offers=Array.isArray(p.offers)?p.offers[0]:(p.offers||{});const priceText=offers.price||offers.lowPrice||meta(html,"product:price:amount")||meta(html,"og:price:amount")||meta(html,"price");
 const sourcePrice=Number(String(priceText).replace(/[^0-9.]/g,""));
 const sourceCurrency=String(offers.priceCurrency||meta(html,"product:price:currency")||meta(html,"og:price:currency")||"").toUpperCase();
 const title=String(p.name||meta(html,"og:title")||meta(html,"twitter:title","name")||((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"").replace(/&amp;/g,"&").trim());
 const description=String(p.description||meta(html,"og:description")||meta(html,"description","name")||"");
 const images=imageCandidates(html,p);
 const dv=offers.shippingDetails||p.shippingDetails;const sd=Array.isArray(dv)?dv[0]:dv;const dest=Array.isArray(sd?.shippingDestination)?sd.shippingDestination[0]:sd?.shippingDestination;const shipAmount=Number(sd?.shippingRate?.value);const shipCurrency=String(sd?.shippingRate?.currency||sourceCurrency).toUpperCase();const shipping=String(dest?.addressCountry||"").toUpperCase()==="SC"&&Number.isFinite(shipAmount)&&shipCurrency?{amount:shipAmount,currency:shipCurrency}:null;
 let fx:any=null;if(sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0){const fr=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(sourceCurrency),{signal:AbortSignal.timeout(8000)});if(fr.ok){const fd=await fr.json();const rate=Number(fd?.rates?.SCR);if(fd?.result==="success"&&rate>0)fx={rate,provider:"open.er-api.com",updated:fd.time_last_update_utc};}}
 const rate=fx?.rate||null;const costScr=rate?Math.round(sourcePrice*rate*100)/100:null;
 let shippingScr:number|null=null;if(shipping){let shippingRate=shipping.currency===sourceCurrency?rate:null;if(!shippingRate){const sr=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(shipping.currency),{signal:AbortSignal.timeout(8000)});if(sr.ok){const sj=await sr.json();if(sj?.result==="success"&&Number(sj?.rates?.SCR)>0)shippingRate=Number(sj.rates.SCR);}}if(shippingRate)shippingScr=Math.round(shipping.amount*shippingRate*100)/100;}
 return NextResponse.json({platform:platform(parsed.hostname.toLowerCase()),sourceUrl:parsed.toString(),title,description,images,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*1.2*100)/100,fx,shipping:shipping?{...shipping,scrAmount:shippingScr}:null,shippingMessage:shipping?"Supplier page exposes a Seychelles shipping quote.":"No verifiable Seychelles shipping quote was exposed in the page data; supplier may require address/login/checkout."});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not preview product."},{status:400});}}