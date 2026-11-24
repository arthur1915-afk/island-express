import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const maxDuration = 300;
const allowed = ["aliexpress.com","shein.com","iherb.com","asos.com","alibaba.com"];
function platform(host:string){return allowed.find(d=>host===d||host.endsWith("."+d))||null;}
function meta(html:string,key:string,attr="property"){const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const a=new RegExp(`<meta[^>]+${attr}=[\"']${escaped}[\"'][^>]+content=[\"']([^\"']*)[\"'][^>]*>`,"i");const b=new RegExp(`<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+${attr}=[\"']${escaped}[\"'][^>]*>`,"i");const m=html.match(a)||html.match(b);return (m?.[1]||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').trim();}
function collect(value:any,out:any[]){if(!value||typeof value!=="object")return;if(Array.isArray(value)){value.forEach(v=>collect(v,out));return;}const types=Array.isArray(value["@type"])?value["@type"]:[value["@type"]];if(types.some((t:any)=>String(t).toLowerCase()==="product"))out.push(value);for(const [k,v] of Object.entries(value)){if(k!=="@type"&&v&&typeof v==="object")collect(v,out);}}

const MARKUP_MULTIPLIER=1.25;
function normaliseCurrencyCode(value:any):string{
 const raw=String(value??"").trim().toUpperCase();
 const aliases:Record<string,string>={"SEYCHELLES RUPEE":"SCR","SEYCHELLES RUPEES":"SCR","SCR":"SCR","US DOLLAR":"USD","US DOLLARS":"USD","U.S. DOLLAR":"USD","CHINESE YUAN":"CNY","RENMINBI":"CNY"};
 return aliases[raw]||raw;
}
function supplierPrice(pricing:any,fallback:any=null):number{
 // AliExpress may return a discounted "new shopper" price that is only available
 // to first-time buyers. Use the regular/original price for resale costing.
 const newShopper=pricing?.is_new_shopper_price===true||pricing?.isNewShopperPrice===true;
 const candidates=newShopper
  ? [pricing?.original_price,pricing?.originalPrice,pricing?.sale_price,pricing?.salePrice,fallback]
  : [pricing?.sale_price,pricing?.salePrice,pricing?.price,pricing?.original_price,pricing?.originalPrice,fallback];
 for(const candidate of candidates){const parsed=parseSupplierPrice(candidate);if(Number.isFinite(parsed)&&parsed>0)return parsed;}
 return NaN;
}
function priceInScr(sourcePrice:number,currencyValue:any,rate:number|null):number|null{
 if(!Number.isFinite(sourcePrice)||sourcePrice<=0)return null;
 const currency=normaliseCurrencyCode(currencyValue);
 // SCR is already the marketplace currency: never run it through FX.
 if(currency==="SCR")return Math.round(sourcePrice*100)/100;
 if(!currency||!rate||!Number.isFinite(rate)||rate<=0)return null;
 return Math.round(sourcePrice*rate*100)/100;
}
function parseSupplierPrice(value:any):number{
 let s=String(value??"").trim().replace(/[^0-9,.-]/g,"");
 if(!s)return NaN;
 const comma=s.lastIndexOf(","),dot=s.lastIndexOf(".");
 if(comma>=0&&dot>=0){
  const decimal=comma>dot?",":".";
  const grouping=decimal===","?".":",";
  s=s.split(grouping).join("");
  if(decimal===",")s=s.replace(",",".");
  else s=s.replace(/,/g,"");
 }else if(comma>=0||dot>=0){
  const sep=comma>=0?",":".";
  const parts=s.split(sep);
  if(parts.length>2){const tail=parts.pop()!;s=parts.join("")+(tail.length<=2?"."+tail:"");}
  else if(parts.length===2){s=parts[0]+(parts[1].length<=2?"."+parts[1]:parts[1]);}
 } 
 return Number(s);
}
async function fetchRateTable(base:string):Promise<{rates:Record<string,number>;updated?:string}|null>{
 try{
  const response=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(base),{signal:AbortSignal.timeout(3500),cache:"no-store"});
  if(!response.ok)return null;
  const data=await response.json();
  if(data?.result!=="success"||!data?.rates||typeof data.rates!=="object")return null;
  return {rates:data.rates,updated:data.time_last_update_utc};
 }catch{return null;}
}
async function getScrRate(currency:string):Promise<number|null>{
 const code=String(currency||"").trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(code))return null;
 if(code==="SCR")return 1;
 const [direct,usd]=await Promise.all([fetchRateTable(code),fetchRateTable("USD")]);
 const directRate=Number(direct?.rates?.SCR);
 if(Number.isFinite(directRate)&&directRate>0)return directRate;
 // Cross-rate fallback: convert source currency to USD, then USD to SCR.
 const sourcePerUsd=Number(usd?.rates?.[code]);
 const scrPerUsd=Number(usd?.rates?.SCR);
 if(Number.isFinite(sourcePerUsd)&&sourcePerUsd>0&&Number.isFinite(scrPerUsd)&&scrPerUsd>0){
  const cross=scrPerUsd/sourcePerUsd;
  if(Number.isFinite(cross)&&cross>0)return cross;
 }
 return null;
}
async function normaliseSkus(skus:any[],basePrice:number,baseCurrency:string,baseRate:number|null,skuProperties:any[]=[]){
 const properties=Array.isArray(skuProperties)?skuProperties:[];
 const propertyById=new Map<string,any>();
 for(const property of properties)propertyById.set(String(property.id),property);
 const defaultCurrency=normaliseCurrencyCode(baseCurrency);
 const currencies=[...new Set(skus.map((sku:any)=>normaliseCurrencyCode(sku?.pricing?.currency??sku?.currency??defaultCurrency)).filter((c:string)=>/^[A-Z]{3}$/.test(c)))];
 const rates=new Map<string,number|null>();
 if(defaultCurrency)rates.set(defaultCurrency,baseRate);
 await Promise.all(currencies.map(async(currency:string)=>{if(!rates.has(currency))rates.set(currency,await getScrRate(currency));}));
 return skus.map((sku:any,index:number)=>{
  const attributes:Record<string,string>={};
  let imageUrl:string|null=null;
  const raw=sku?.attributes??sku?.sku_attributes??sku?.properties;
  const addAttribute=(key:string,value:any)=>{if(key&&value!==undefined&&value!==null&&String(value).trim())attributes[key]=String(value).trim();};
  if(typeof raw==="string"){
   for(const token of raw.split(";")){
    const [propertyId,valuePart]=token.split(":");
    if(!propertyId||!valuePart)continue;
    const [valueId,labelPart]=valuePart.split("#");
    const property=propertyById.get(String(propertyId));
    const option=property?.values?.find((v:any)=>String(v?.id)===String(valueId));
    addAttribute(String(property?.name||("Option "+propertyId)),option?.name??labelPart??valueId);
    if(!imageUrl&&typeof option?.image==="string"&&/^https:\/\//i.test(option.image))imageUrl=option.image;
   }
  }else if(raw&&typeof raw==="object"&&!Array.isArray(raw)){
   for(const [key,value] of Object.entries(raw)){const v=typeof value==="object"&&value!==null?((value as any).name??(value as any).value??(value as any).label??JSON.stringify(value)):value;addAttribute(String(key),v);}
  }else if(Array.isArray(raw)){
   for(const item of raw){if(item&&typeof item==="object"){const key=String(item.name??item.attribute??item.key??"Option");const value=item.value??item.label??item.text??item.option_name;addAttribute(key,value);}}
  }
  if(!Object.keys(attributes).length&&sku?.label)addAttribute("Option",sku.label);
  const label=Object.entries(attributes).map(([key,value])=>key+": "+value).join(" / ")||String(sku?.label||sku?.name||"Option "+(index+1));
  const rawPrice=sku?.pricing??null;
  const sourcePrice=rawPrice?supplierPrice(rawPrice,sku?.sale_price??sku?.price??sku?.price_scr??basePrice):parseSupplierPrice(sku?.sale_price??sku?.price??sku?.price_scr??basePrice);
  const sourceCurrency=normaliseCurrencyCode(sku?.pricing?.currency??sku?.currency??baseCurrency);
  const rate=rates.get(sourceCurrency)??null;
  const costScr=priceInScr(sourcePrice,sourceCurrency,rate);
  const sellingPriceScr=costScr===null?null:Math.round(costScr*MARKUP_MULTIPLIER*100)/100;
  const stockValue=Number(sku?.stock??sku?.quantity??sku?.stock_quantity);
  const available=sku?.is_available??sku?.available??sku?.in_stock;
  const stock=available===false?0:(Number.isFinite(stockValue)?Math.max(0,Math.floor(stockValue)):0);
  return {label,attributes,sourcePrice:Number.isFinite(sourcePrice)?sourcePrice:basePrice,sourceCurrency,exchangeRate:rate,costScr,priceScr:sellingPriceScr,stock,imageUrl:sku?.image_url||sku?.imageUrl||imageUrl};
 }).filter((variant:any)=>variant.label);
}
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
function canonicalAliExpressProductUrl(input:string):string{
 const parsed=new URL(input);
 const match=parsed.pathname.match(/\/item\/(\d+)(?:\.html)?/i);
 if(!match)throw new Error("Use a standard AliExpress product link containing /item/ followed by the product ID.");
 return "https://www.aliexpress.com/item/"+match[1]+".html";
}
function parseCrawlHtml(html:string):any{
 const products:any[]=[];
 const scripts=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 for(const m of scripts){try{collect(JSON.parse(m[1]),products);}catch{}}
 const product=products[0]||{};
 const offers=Array.isArray(product.offers)?product.offers[0]:(product.offers||{});
 const readMeta=(name:string)=>meta(html,name)||meta(html,name,"name");
 const title=String(product.name||readMeta("og:title")||readMeta("twitter:title")||((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"").replace(/&amp;/g,"&").trim());
 const desc=product.description||readMeta("og:description")||readMeta("description");
 const price=offers.price||offers.lowPrice||readMeta("product:price:amount")||readMeta("og:price:amount");
 const currency=offers.priceCurrency||readMeta("product:price:currency")||readMeta("og:price:currency");
 const images=imageCandidates(html,product);
 const stateMatches=[...html.matchAll(/(?:window\.__INITIAL_STATE__|window\.__NEXT_DATA__|window\.runParams|window\.pageData|window\.data)\s*=\s*(\{[\s\S]{20,}?)(?:;\s*<\/script>|;\s*<\/|;\s*$)/gi)];
 let embedded:any=null;
 for(const match of stateMatches){try{embedded=JSON.parse(match[1]);break;}catch{}}
 return {title,description:desc,price,currency,images,...(embedded?{embedded}:{}),rawHtml:html};
}
function normaliseCrawlResult(raw:any):any{
 let value=raw;
 for(let depth=0;depth<5;depth++){
  if(typeof value==="string"){
   const trimmed=value.trim();
   if(trimmed.startsWith("{")||trimmed.startsWith("[")){try{value=JSON.parse(trimmed);continue;}catch{}}
   if(/<html|<!doctype html|<head|<body/i.test(trimmed))return parseCrawlHtml(trimmed);
   break;
  }
  if(!value||typeof value!=="object"||Array.isArray(value))break;
  if(value.body!==undefined&&value.body!==null){value=value.body;continue;}
  if(value.data&&typeof value.data==="object"){value=value.data;continue;}
  if(value.product&&typeof value.product==="object"){value=value.product;continue;}
  if(value.result&&typeof value.result==="object"){value=value.result;continue;}
  break;
 }
 return value;
}
async function scrapeAliExpressManaged(url:string):Promise<any>{
 const token=process.env.CRAWLBASE_JS_TOKEN;
 if(!token)throw new Error("The AliExpress importer requires CRAWLBASE_JS_TOKEN in Vercel Production.");
 const endpoint=new URL("https://api.crawlbase.com/");
 endpoint.searchParams.set("token",token);
 endpoint.searchParams.set("url",canonicalAliExpressProductUrl(url));
 // Autoparse avoids depending on a scraper name that may not be enabled for
 // this Crawlbase account. ajax_wait waits for product data without a fixed delay.
 endpoint.searchParams.set("autoparse","true");
 endpoint.searchParams.set("ajax_wait","true");
 endpoint.searchParams.set("format","json");
 endpoint.searchParams.set("async","true");
 endpoint.searchParams.set("store","true");
 let accepted:Response;
 try{
  accepted=await fetch(endpoint.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000),cache:"no-store"});
 }catch(error){throw new Error("Crawlbase did not accept the request within 12 seconds: "+(error instanceof Error?error.message:"network error"));}
 const acceptedText=await accepted.text();
 let acceptedPayload:any=null;try{acceptedPayload=JSON.parse(acceptedText);}catch{}
 const rid=accepted.headers.get("rid")||acceptedPayload?.rid||acceptedPayload?.request_id||null;
 const cbStatus=accepted.headers.get("cb_status")||accepted.headers.get("pc_status")||acceptedPayload?.cb_status||acceptedPayload?.pc_status||null;
 if(!accepted.ok||(cbStatus&&String(cbStatus)!=="200")||!rid){
  throw new Error("Crawlbase could not queue the product request."+(cbStatus?" Crawl status "+cbStatus+".":"")+" "+String(acceptedPayload?.message||acceptedPayload?.error||acceptedText).slice(0,180));
 }
 const storage=new URL("https://api.crawlbase.com/storage");
 storage.searchParams.set("token",token);
 storage.searchParams.set("rid",String(rid));
 storage.searchParams.set("format","json");
 const deadline=Date.now()+18000;
 let lastError="";
 while(Date.now()<deadline){
  await new Promise(resolve=>setTimeout(resolve,1200));
  let result:Response;
  try{result=await fetch(storage.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000),cache:"no-store"});}
  catch(error){lastError=error instanceof Error?error.message:"Storage request failed";continue;}
  const resultText=await result.text();
  let stored:any=null;try{stored=JSON.parse(resultText);}catch{}
  if(result.status===404||result.status===202||stored?.error==="Not Found"||stored?.status==="PROCESSING"||stored?.status==="QUEUED")continue;
  if(!result.ok){lastError="Storage HTTP "+result.status;continue;}
  const product=normaliseCrawlResult(stored??resultText);
  if(product&&typeof product==="object"&&!Array.isArray(product)){
   const hasTitle=typeof product.title==="string"&&product.title.trim();
   const hasPrice=product.price!==undefined||product.current_price!==undefined||product.sale_price!==undefined;
   const hasImages=Array.isArray(product.images)?product.images.length>0:!!product.images||!!product.image;
   if(hasTitle||hasPrice||hasImages)return product;
   throw new Error("Crawlbase completed but returned no recognised product fields. Request "+rid+".");
  }
  lastError="Stored result did not contain a recognised product payload.";
 }
 throw new Error("AliExpress is taking longer than the 10–20 second import target. Crawlbase request "+rid+" is still processing. Please retry shortly.");
}
function managedImages(value:any):string[]{
 const found:string[]=[];
 const seen=new Set<any>();
 const add=(item:any,depth=0):void=>{
  if(item===null||item===undefined||depth>7)return;
  if(typeof item==="string"){
   const raw=item.trim().replace(/&amp;/g,"&").replace(/\\u0026/gi,"&");
   const urls=raw.match(/https?:\/\/[^\s"'<>]+|\/\/[^\s"'<>]+/gi)||[];
   for(const candidate of urls){
    const url=candidate.startsWith("//")?"https:"+candidate:candidate;
    const clean=url.replace(/[),;]+$/,"");
    if(/^https:\/\//i.test(clean)&&/(aliexpress-media|alicdn|ae-pic|\.jpg|\.jpeg|\.png|\.webp)/i.test(clean)&&!/(sprite|logo|icon|avatar|placeholder)/i.test(clean))found.push(clean);
   }
   return;
  }
  if(typeof item!=="object"||seen.has(item))return;
  seen.add(item);
  if(Array.isArray(item)){item.forEach(v=>add(v,depth+1));return;}
  for(const [key,val] of Object.entries(item)){
   if(/image|picture|photo|gallery|url|src|origin/i.test(key))add(val,depth+1);
  }
 };
 add(value);
 return [...new Set(found)].slice(0,12);
}
function findManagedValue(root:any,keys:string[]):any{
 const wanted=new Set(keys.map(k=>k.toLowerCase()));
 const queue=[root];const seen=new Set<any>();
 while(queue.length){
  const current=queue.shift();
  if(!current||typeof current!=="object"||seen.has(current))continue;
  seen.add(current);
  if(Array.isArray(current)){queue.push(...current);continue;}
  for(const [key,value] of Object.entries(current)){
   if(wanted.has(key.toLowerCase())&&value!==null&&value!==undefined&&value!==""&&(!Array.isArray(value)||value.length>0)&&(typeof value!=="object"||Array.isArray(value)||Object.keys(value).length>0))return value;
  }
  queue.push(...Object.values(current).filter(v=>v&&typeof v==="object"));
 }
 return undefined;
}
function managedDescription(value:any):string{
 if(typeof value==="string")return value.trim();
 if(Array.isArray(value))return value.map((item:any)=>typeof item==="string"?item:[item?.name??item?.key,item?.value??item?.description].filter(Boolean).join(": ")).filter(Boolean).join("\n");
 if(value&&typeof value==="object")return Object.entries(value).map(([k,v])=>k+": "+(typeof v==="string"?v:JSON.stringify(v))).join("\n");
 return "";
}
function managedCurrency(value:any):string{
 const raw=String(value??"").trim().toUpperCase();
 const code=raw.match(/\b[A-Z]{3}\b/);
 if(code)return normaliseCurrencyCode(code[0]);
 if(raw.includes("$"))return "USD";
 if(raw.includes("€"))return "EUR";
 if(raw.includes("£"))return "GBP";
 if(raw.includes("¥")||raw.includes("￥"))return "CNY";
 return "";
}
export async function POST(request:NextRequest){try{
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return NextResponse.json({error:"Sign in as an administrator."},{status:401});
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,a=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,s=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!a||!s)return NextResponse.json({error:"Admin importer is not configured."},{status:500});
 const auth=createClient(u,a,{auth:{persistSession:false,autoRefreshToken:false}});const {data:{user}}=await auth.auth.getUser(token);if(!user)return NextResponse.json({error:"Session expired."},{status:401});
 const db=createClient(u,s,{auth:{persistSession:false,autoRefreshToken:false}});const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).single();if(!profile?.is_admin)return NextResponse.json({error:"Administrator access required."},{status:403});
 const body=await request.json();const parsed=new URL(String(body.url||""));if(parsed.protocol!=="https:"||!platform(parsed.hostname.toLowerCase()))return NextResponse.json({error:"Use an HTTPS product URL from AliExpress, SHEIN, iHerb, ASOS or Alibaba."},{status:400});
 if(platform(parsed.hostname.toLowerCase())==="aliexpress.com"){
  const managed=await scrapeAliExpressManaged(parsed.toString());
  const priceValue=findManagedValue(managed,["price","current_price","sale_price","salePrice","min_price","minPrice","seller_offer_price"]);
  const originalPrice=findManagedValue(managed,["original_price","originalPrice","list_price","listPrice"]);
  const sourcePrice=parseSupplierPrice(typeof priceValue==="object"?(priceValue.current??priceValue.value??priceValue.sale_price??priceValue.amount):priceValue);
  const currencyInput=findManagedValue(managed,["currency","price_currency","priceCurrency"])??priceValue;
  const sourceCurrency=managedCurrency(currencyInput)||"USD";
  const rawTitle=findManagedValue(managed,["title","product_title","productTitle","name","subject"]);
  const title=typeof rawTitle==="string"?rawTitle.trim():"";
  const descriptionValue=findManagedValue(managed,["description","product_description","productDescription","short_description","specifications","specs","product_specs","productSpecs","features","highlights","selling_points","sellingPoints","attributes","property_list","properties","detail"]);
  const description=managedDescription(descriptionValue);
  const images=managedImages(findManagedValue(managed,["images","image_urls","imageUrls","image","main_image","mainImage","gallery","pictures","media","product_images","productImages","image_list","imageList","image_url","imageUrl"]));
  const rawVariantValue=findManagedValue(managed,["variants","skus","sku_list","skuList","sku_info"]);const rawVariants=Array.isArray(rawVariantValue)?rawVariantValue:[];
  const skuRows=rawVariants.filter((v:any)=>v&&typeof v==="object"&&(v.price!==undefined||v.sale_price!==undefined||v.sku_id||v.skuId||v.stock!==undefined||v.quantity!==undefined||v.attributes||v.sku_attributes)).map((v:any)=>({...v,attributes:v.attributes??v.sku_attributes??v.properties??v.options??v.label,pricing:v.pricing??{sale_price:v.price??v.current_price??v.sale_price??priceValue,currency:v.currency??sourceCurrency},stock:v.stock??v.quantity??v.available_quantity??v.stock_quantity,image_url:v.image_url??v.image}));
  const fx=sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0?await getScrRate(sourceCurrency):null;
  const rate=sourceCurrency==="SCR"?1:fx;
  const costScr=priceInScr(sourcePrice,sourceCurrency,rate);
  const variants=await normaliseSkus(skuRows,Number.isFinite(sourcePrice)?sourcePrice:0,sourceCurrency,rate,[]);
  const shippingValue=managed?.shipping??managed?.shipping_options??managed?.shippingOptions;
  const shippingText=typeof shippingValue==="string"?shippingValue:shippingValue?JSON.stringify(shippingValue).slice(0,300):"";
  const originalPriceValue=parseSupplierPrice(typeof originalPrice==="object"?(originalPrice.value??originalPrice.amount??originalPrice.current):originalPrice);
  if(!title||/^(not found|page not found|access denied|error)$/i.test(title))throw new Error("Crawlbase did not return a valid AliExpress product title. The scraper appears to have returned an error or unavailable page.");
  if(!Number.isFinite(sourcePrice)||sourcePrice<=0)throw new Error("Crawlbase did not return a valid product price. No product was created.");
  if(!images.length)throw new Error("Crawlbase did not return any product images. No product was created; check the AliExpress scraper result and request logs.");
  if(descriptionValue&&typeof descriptionValue==="object"&&!description)throw new Error("The supplier description could not be converted into readable text. No product was created.");
  return NextResponse.json({platform:"aliexpress.com",sourceUrl:canonicalAliExpressProductUrl(parsed.toString()),title,description,images,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,originalSourcePrice:Number.isFinite(originalPriceValue)&&originalPriceValue>0?originalPriceValue:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*MARKUP_MULTIPLIER*100)/100,fx:rate?{rate,provider:"open.er-api.com"}:null,shipping:null,shippingMessage:shippingText?"Supplier shipping data detected. Confirm the final delivery fee to Seychelles before importing.":"No verified Seychelles delivery quote was returned. Enter the customer delivery fee manually.",supplierDataSource:"Crawlbase AliExpress Product Scraper",variants,supplierDebug:{scraper:"Crawlbase aliexpress-product",productKeys:Object.keys(managed||{}),skuCount:skuRows.length,skuPropertyCount:0,firstSkuAttributes:skuRows[0]?.attributes??null,firstSkuProperty:null},specifications:findManagedValue(managed,["specifications","specs","attributes","features"])||[]});
 }
 const response=await fetch(parsed.toString(),{headers:{"User-Agent":"Mozilla/5.0 (compatible; islandXpressProductPreview/1.0)",Accept:"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(12000),redirect:"follow"});if(!response.ok)throw new Error("Supplier page could not be accessed. Enter product details manually.");
 const html=(await response.text()).slice(0,2500000);const products:any[]=[];const scripts=[...html.matchAll(/<script[^>]*type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/gi)];for(const m of scripts){try{collect(JSON.parse(m[1]),products);}catch{}}
 const p=products[0]||{};const offers=Array.isArray(p.offers)?p.offers[0]:(p.offers||{});const priceText=offers.price||offers.lowPrice||meta(html,"product:price:amount")||meta(html,"og:price:amount")||meta(html,"price");
 const sourcePrice=parseSupplierPrice(priceText);
 const sourceCurrency=normaliseCurrencyCode(offers.priceCurrency||meta(html,"product:price:currency")||meta(html,"og:price:currency")||"");
 const title=String(p.name||meta(html,"og:title")||meta(html,"twitter:title","name")||((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"").replace(/&amp;/g,"&").trim());
 const description=String(p.description||meta(html,"og:description")||meta(html,"description","name")||"");
 const images=imageCandidates(html,p);
 const dv=offers.shippingDetails||p.shippingDetails;const sd=Array.isArray(dv)?dv[0]:dv;const dest=Array.isArray(sd?.shippingDestination)?sd.shippingDestination[0]:sd?.shippingDestination;const shipAmount=Number(sd?.shippingRate?.value);const shipCurrency=String(sd?.shippingRate?.currency||sourceCurrency).toUpperCase();const shipping=String(dest?.addressCountry||"").toUpperCase()==="SC"&&Number.isFinite(shipAmount)&&shipCurrency?{amount:shipAmount,currency:shipCurrency}:null;
 let fx:any=null;if(sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0){const convertedRate=await getScrRate(sourceCurrency);if(convertedRate)fx={rate:convertedRate,provider:"open.er-api.com (direct or USD cross-rate)"};}
 const rate=sourceCurrency==="SCR"?1:(fx?.rate||null);const costScr=priceInScr(sourcePrice,sourceCurrency,rate);
 let shippingScr:number|null=null;if(shipping){let shippingRate=shipping.currency===sourceCurrency?rate:null;if(!shippingRate){const sr=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(shipping.currency),{signal:AbortSignal.timeout(8000)});if(sr.ok){const sj=await sr.json();if(sj?.result==="success"&&Number(sj?.rates?.SCR)>0)shippingRate=Number(sj.rates.SCR);}}if(shippingRate)shippingScr=Math.round(shipping.amount*shippingRate*100)/100;}
 return NextResponse.json({platform:platform(parsed.hostname.toLowerCase()),sourceUrl:parsed.toString(),title,description,images,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*MARKUP_MULTIPLIER*100)/100,fx,shipping:shipping?{...shipping,scrAmount:shippingScr}:null,shippingMessage:shipping?"Supplier page exposes a Seychelles shipping quote.":"No verifiable Seychelles shipping quote was exposed in the page data; supplier may require address/login/checkout."});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not preview product."},{status:400});}}