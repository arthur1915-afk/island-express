import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const maxDuration = 60;
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
  const response=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(base),{signal:AbortSignal.timeout(5000),cache:"no-store"});
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
 const direct=await fetchRateTable(code);
 const directRate=Number(direct?.rates?.SCR);
 if(Number.isFinite(directRate)&&directRate>0)return directRate;
 // Cross-rate fallback: convert source currency to USD, then USD to SCR.
 const usd=await fetchRateTable("USD");
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
async function scrapeAliExpressOmkar(url:string):Promise<any>{
 const apiKey=process.env.ALIEXPRESS_SCRAPER_API_KEY;
 if(!apiKey)throw new Error("Omkar is not configured. Add ALIEXPRESS_SCRAPER_API_KEY to the Vercel Production environment and redeploy.");
 const endpoint=new URL("https://aliexpress-scraper-api.omkar.cloud/aliexpress/v2/product");
 endpoint.searchParams.set("product",url);
 const response=await fetch(endpoint.toString(),{method:"GET",headers:{"Accept":"application/json","API-Key":apiKey},signal:AbortSignal.timeout(45000),cache:"no-store"});
 const raw=await response.text();
 let data:any;
 try{data=JSON.parse(raw);}catch{throw new Error("Omkar returned a non-JSON response (HTTP "+response.status+").");}
 if(!response.ok){
  const code=String(data?.code||"");
  const message=String(data?.message||"Omkar AliExpress scraper returned HTTP "+response.status+".");
  if(response.status===401)throw new Error("Omkar rejected the API key. Check ALIEXPRESS_SCRAPER_API_KEY in Vercel.");
  if(response.status===402)throw new Error("Omkar subscription is not active. Activate the AliExpress Scraper plan in Omkar.");
  if(response.status===429)throw new Error(code==="quota_exceeded"?"Omkar monthly request quota has been used. Check your Omkar plan and renewal date.":message);
  throw new Error(message);
 }
 if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Omkar returned an unexpected product response.");
 return data;
}
function managedImages(value:any):string[]{
 const found:string[]=[];
 const add=(item:any):void=>{
  if(typeof item==="string"){const u=item.startsWith("//")?"https:"+item:item;if(/^https:\/\//i.test(u)&&!/(sprite|logo|icon|avatar|placeholder)/i.test(u))found.push(u);return;}
  if(Array.isArray(item)){item.forEach(add);return;}
  if(item&&typeof item==="object"){for(const key of ["url","image_url","imageUrl","src","original","large","full","contentUrl"])if(item[key]!==undefined)add(item[key]);}
 };
 add(value);
 return [...new Set(found)].slice(0,12);
}
function managedField(product:any,keys:string[]):any{
 for(const key of keys){const value=product?.[key];if(value!==undefined&&value!==null&&value!=="")return value;}
 return undefined;
}
function managedPriceValue(value:any):any{
 if(value&&typeof value==="object")return value.current??value.current_price??value.sale_price??value.value??value.amount??value.formatted??value.price??value.min??value.min_price;
 return value;
}
function flattenSupplierText(value:any):string{
 if(value===null||value===undefined)return "";
 if(typeof value==="string"||typeof value==="number")return String(value).trim();
 if(Array.isArray(value))return value.map(flattenSupplierText).filter(Boolean).join("\n");
 if(typeof value==="object"){
  for(const key of ["html","text","content","description","value","detail","textContent","translatedText","en","english"]){
   if(value[key]!==undefined){const text=flattenSupplierText(value[key]);if(text)return text;}
  }
  return Object.entries(value).map(([key,v])=>{const text=flattenSupplierText(v);return text?key+": "+text:"";}).filter(Boolean).join("\n");
 }
 return "";
}
function hasCyrillic(value:string):boolean{return /[\u0400-\u04FF]/.test(value);}
async function translateToEnglish(value:string):Promise<string>{
 const text=value.trim();if(!text||!hasCyrillic(text))return text;
 try{
  const endpoint=new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client","gtx");endpoint.searchParams.set("sl","auto");endpoint.searchParams.set("tl","en");endpoint.searchParams.set("dt","t");endpoint.searchParams.set("q",text.slice(0,4500));
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(9000),cache:"no-store"});
  if(response.ok){const data=await response.json();const translated=Array.isArray(data?.[0])?data[0].map((part:any)=>Array.isArray(part)?part[0]:"").join("").trim():"";if(translated&&!hasCyrillic(translated))return translated;}
 }catch{}
 try{
  const endpoint=new URL("https://api.mymemory.translated.net/get");endpoint.searchParams.set("q",text.slice(0,450));endpoint.searchParams.set("langpair","ru|en");
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(3500),cache:"no-store"});
  if(response.ok){const data=await response.json();const translated=String(data?.responseData?.translatedText||"").trim();if(translated&&!hasCyrillic(translated))return translated;}
 }catch{}
 return text;
}
function aliExpressUrlPrice(url:string):{price:number;currency:string;originalPrice:number|null}|null{
 try{
  const raw=new URL(url).searchParams.get("pdp_npi");if(!raw)return null;
  const parts=raw.split("!");
  const currency=normaliseCurrencyCode(parts[1]||"");
  const original=parseSupplierPrice(parts[2]);
  const current=parseSupplierPrice(parts[3]);
  if(!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(current)||current<=0)return null;
  return {price:current,currency,originalPrice:Number.isFinite(original)&&original>0?original:null};
 }catch{return null;}
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
  const managed=await scrapeAliExpressOmkar(parsed.toString());
  const priceObject=managedField(managed,["pricing","price","current_price","currentPrice","sale_price","salePrice","min_price","minPrice"]);
  const priceValue=managedPriceValue(priceObject)??managedField(managed,["price_formatted","priceFormatted","formatted_price","formattedPrice"]);
  const apiPrice=parseSupplierPrice(priceValue);
  const apiCurrency=managedCurrency(managedField(managed,["currency","currency_code","currencyCode","price_currency","priceCurrency"])??(priceObject&&typeof priceObject==="object"?priceObject.currency??priceObject.currency_code:undefined)??(typeof priceValue==="string"?priceValue:""));
  const urlPrice=aliExpressUrlPrice(parsed.toString());
  const useUrlPrice=Boolean(urlPrice?.currency==="SCR");
  const sourcePrice=useUrlPrice?urlPrice!.price:apiPrice;
  const sourceCurrency=useUrlPrice?"SCR":(apiCurrency||"");
  const rawTitle=flattenSupplierText(managedField(managed,["title_en","titleEn","translated_title","translatedTitle","title","product_title","productTitle","name","subject"]));
  const rawDescription=flattenSupplierText(managedField(managed,["description_en","descriptionEn","translated_description","translatedDescription","description","descriptionText","description_text","descriptionHtml","description_html","product_description","productDescription","short_description","shortDescription","details"])??managed?.specifications);
  const [title,description]=await Promise.all([translateToEnglish(rawTitle),translateToEnglish(rawDescription)]);
  const images=managedImages(managedField(managed,["images","image_urls","imageUrls","image","image_url","imageUrl","gallery","product_images","productImages"]));
  const variantValue=managedField(managed,["skus","variants","variant_options","variantOptions","sku","sku_list","skuList"]);
  const rawVariants=Array.isArray(variantValue)?variantValue:(variantValue&&typeof variantValue==="object"?Object.values(variantValue):[]);
  const skuRows=rawVariants.filter((v:any)=>v&&typeof v==="object").map((v:any)=>({...v,attributes:v.attributes??v.properties??v.options??v.label,pricing:v.pricing??{sale_price:v.price??v.current_price??priceValue,currency:v.currency??sourceCurrency},stock:v.stock??v.quantity??v.available_quantity,image_url:v.image_url??v.image}));
  const optionGroups=managedField(managed,["sku_properties","skuProperties","options","properties"]);
  if(!skuRows.length&&Array.isArray(optionGroups)){
   for(const group of optionGroups){
    if(!group||typeof group!=="object")continue;
    const groupName=String(group.name??group.title??group.propertyName??group.label??"Option");
    const values=group.values??group.options??group.items??group.children??[];
    if(Array.isArray(values))for(const value of values){
     const label=typeof value==="string"?value:String(value?.name??value?.label??value?.value??"");
     if(label)skuRows.push({label,attributes:{[groupName]:label},price:priceValue,currency:sourceCurrency,stock:0,image_url:value?.image??value?.imageUrl??null});
    }
   }
  }
  const fx=sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0?await getScrRate(sourceCurrency):null;
  const rate=sourceCurrency==="SCR"?1:fx;
  const costScr=priceInScr(sourcePrice,sourceCurrency,rate);
  const variants=await normaliseSkus(skuRows,Number.isFinite(sourcePrice)?sourcePrice:0,sourceCurrency,rate,Array.isArray(optionGroups)?optionGroups:[]);
  const shippingOptions=managed?.shipping?.options??[];
  const shippingText=Array.isArray(shippingOptions)?shippingOptions.map((o:any)=>[o.name,o.price,o.currency].filter(Boolean).join(" ")).join("; "):"";
  if(!title&&!images.length&&(!Number.isFinite(sourcePrice)||sourcePrice<=0)){
   const keys=Object.keys(managed||{}).slice(0,35).join(", ")||"none";
   throw new Error("Omkar reached the AliExpress listing but required product fields were not recognised. Returned fields: "+keys+".");
  }
  return NextResponse.json({platform:"aliexpress.com",sourceUrl:parsed.toString(),title,description,images,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*MARKUP_MULTIPLIER*100)/100,fx:rate?{rate,provider:"Omkar AliExpress Scraper API"}:null,shipping:null,shippingMessage:shippingText?"Omkar returned supplier shipping options ("+shippingText+"). Confirm the final Seychelles delivery fee before importing.":"No verified Seychelles delivery quote was returned. Enter the customer delivery fee manually.",supplierDataSource:"Omkar AliExpress Scraper API",variants,supplierDebug:{scraper:"Omkar API",productKeys:Object.keys(managed||{}),skuCount:rawVariants.length,skuPropertyCount:Array.isArray(optionGroups)?optionGroups.length:0,firstSkuAttributes:rawVariants[0]??null,firstSkuProperty:Array.isArray(optionGroups)?optionGroups[0]??null:null,priceSource:useUrlPrice?"AliExpress pdp_npi URL price":"Omkar product response",urlPrice:urlPrice??null,apiPrice:Number.isFinite(apiPrice)?apiPrice:null,apiCurrency:apiCurrency||null,rawTitle,descriptionWasStructured:typeof managedField(managed,["description","product_description","productDescription","short_description","shortDescription","details"])==="object"},specifications:managed?.specifications||[]});
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