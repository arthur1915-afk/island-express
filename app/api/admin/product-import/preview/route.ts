import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scrapeAliExpressPage } from "../../../../../lib/aliexpress-scraper";
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
  const response=await fetch("https://open.er-api.com/v6/latest/"+encodeURIComponent(base),{signal:AbortSignal.timeout(9000),cache:"no-store"});
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
async function scrapeAliExpressManaged(url:string):Promise<any>{
 const token=process.env.CRAWLBASE_JS_TOKEN||process.env.CRAWLBASE_TOKEN;
 if(!token)throw new Error("Managed AliExpress importing is not configured. Add the Crawlbase JavaScript token in Vercel.");
 const endpoint=new URL("https://api.crawlbase.com/");
 endpoint.searchParams.set("token",token);
 endpoint.searchParams.set("url",url);
 endpoint.searchParams.set("scraper","aliexpress-product");
 const response=await fetch(endpoint.toString(),{method:"GET",headers:{Accept:"application/json"},signal:AbortSignal.timeout(120000),cache:"no-store"});
 const raw=await response.text();
 if(!response.ok)throw new Error("Crawlbase AliExpress service returned HTTP "+response.status+". Check the Crawlbase token, credits and scraper access.");
 let data:any;
 try{data=JSON.parse(raw);}catch{throw new Error("Crawlbase returned a non-JSON response (HTTP "+response.status+"). Check that the JavaScript token is being used.");}
 if(data?.error||data?.success===false)throw new Error(String(data.error||data.message||"Crawlbase could not extract this AliExpress listing."));
 // Crawlbase's scraper result is sometimes returned directly and sometimes wrapped
 // by the Crawling API/SDK response as body, data, result or response.
 const parseNested=(value:any):any=>{
  if(typeof value==="string"){const s=value.trim();if((s.startsWith("{")&&s.endsWith("}"))||(s.startsWith("[")&&s.endsWith("]"))){try{return parseNested(JSON.parse(s));}catch{}}return value;}
  if(Array.isArray(value))return value.length?parseNested(value[0]):value;
  if(!value||typeof value!=="object")return value;
  for(const key of ["body","data","result","response","product","payload"]){
   const child=value[key];
   if(child!==undefined&&child!==null){
    const unwrapped=parseNested(child);
    if(unwrapped&&typeof unwrapped==="object"&&!Array.isArray(unwrapped))return unwrapped;
   }
  }
  return value;
 };
 const parsed=parseNested(data);
 // If a wrapper contains several nested records, prefer the object carrying
 // actual product fields rather than the API transport metadata.
 const candidates:any[]=[];
 const walk=(v:any,depth=0)=>{if(!v||typeof v!=="object"||depth>8)return;if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return;}candidates.push(v);for(const x of Object.values(v))if(x&&typeof x==="object")walk(x,depth+1);};
 walk(parsed);
 const score=(v:any)=>(
  (v.title||v.product_title||v.productTitle||v.name||v.subject?5:0)+
  (v.price!==undefined||v.current_price!==undefined||v.sale_price!==undefined||v.original_price!==undefined?4:0)+
  (v.images||v.image||v.image_url||v.image_urls?3:0)+
  (v.variants||v.sku||v.skus?2:0)
 );
 return candidates.reduce((best,v)=>score(v)>score(best||{})?v:best,parsed);
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
 if(Array.isArray(value))return value.map(flattenSupplierText).filter(Boolean).join("\\n");
 if(typeof value==="object"){
  for(const key of ["html","text","content","description","value","detail","textContent","translatedText","en","english"]){
   if(value[key]!==undefined){const text=flattenSupplierText(value[key]);if(text)return text;}
  }
  return Object.entries(value).map(([key,v])=>{const text=flattenSupplierText(v);return text?key+": "+text:"";}).filter(Boolean).join("\\n");
 }
 return "";
}
function hasCyrillic(value:string):boolean{return /[\\u0400-\\u04FF]/.test(value);}
async function translateToEnglish(value:string):Promise<string>{
 const text=value.trim();if(!text||!hasCyrillic(text))return text;
 try{
  const endpoint=new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.searchParams.set("client","gtx");endpoint.searchParams.set("sl","auto");endpoint.searchParams.set("tl","en");endpoint.searchParams.set("dt","t");endpoint.searchParams.set("q",text.slice(0,4500));
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(7000),cache:"no-store"});
  if(!response.ok)return text;
  const data=await response.json();
  const translated=Array.isArray(data?.[0])?data[0].map((part:any)=>Array.isArray(part)?part[0]:"").join("").trim():"";
  return translated||text;
 }catch{return text;}
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
  if(process.env.CRAWLBASE_JS_TOKEN||process.env.CRAWLBASE_TOKEN){
   const managed=await scrapeAliExpressManaged(parsed.toString());
   const priceObject=managedField(managed,["price","pricing","current_price","currentPrice","sale_price","salePrice","min_price","minPrice"]);
   const priceValue=managedPriceValue(priceObject)??managedField(managed,["price_formatted","priceFormatted","formatted_price","formattedPrice"]);
   const apiPrice=parseSupplierPrice(priceValue);
   const apiCurrency=managedCurrency(managedField(managed,["currency","currency_code","currencyCode","price_currency","priceCurrency"])??(priceObject&&typeof priceObject==="object"?priceObject.currency??priceObject.currency_code:undefined)??(typeof priceValue==="string"?priceValue:""));
   // AliExpress embeds its shopper-localised price in pdp_npi. When it explicitly
   // supplies SCR, use that value instead of guessing the currency of a bare number.
   const urlPrice=aliExpressUrlPrice(parsed.toString());
   const useUrlPrice=Boolean(urlPrice?.currency==="SCR");
   const sourcePrice=useUrlPrice?urlPrice!.price:apiPrice;
   const sourceCurrency=useUrlPrice?"SCR":(apiCurrency||"");
   const rawTitle=flattenSupplierText(managedField(managed,["title_en","titleEn","translated_title","translatedTitle","product_title_en","productTitleEn","title","product_title","productTitle","name","subject"]));
   const rawDescription=flattenSupplierText(managedField(managed,["description_en","descriptionEn","translated_description","translatedDescription","description","product_description","productDescription","short_description","shortDescription","details"])??managed?.specifications);
   const title=await translateToEnglish(rawTitle);
   const description=await translateToEnglish(rawDescription);
   const images=managedImages(managedField(managed,["images","image_urls","imageUrls","image","image_url","imageUrl","gallery","product_images","productImages"]));
   const variantValue=managedField(managed,["variants","options","sku","skus","sku_list","skuList"]);
   const rawVariants=Array.isArray(variantValue)?variantValue:(variantValue&&typeof variantValue==="object"?Object.values(variantValue):[]);
   const skuRows=rawVariants.filter((v:any)=>v&&typeof v==="object").map((v:any)=>({...v,attributes:v.attributes??v.properties??v.options??v.label,pricing:v.pricing??{sale_price:v.price??v.current_price??priceValue,currency:v.currency??sourceCurrency},stock:v.stock??v.quantity??v.available_quantity,image_url:v.image_url??v.image}));
   const fx=sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0?await getScrRate(sourceCurrency):null;
   const rate=sourceCurrency==="SCR"?1:fx;
   const costScr=priceInScr(sourcePrice,sourceCurrency,rate);
   const variants=await normaliseSkus(skuRows,Number.isFinite(sourcePrice)?sourcePrice:0,sourceCurrency,rate,[]);
   const shippingSummary=managed?.shippingSummary??managed?.shipping_summary??managed?.shipping;
   const shippingText=typeof shippingSummary==="string"?shippingSummary:String(shippingSummary?.shippingPrice??shippingSummary?.price??"");
   if(!title&&!images.length&&(!Number.isFinite(sourcePrice)||sourcePrice<=0)){
    const keys=Object.keys(managed||{}).slice(0,30).join(", ")||"none";
    throw new Error("Crawlbase reached the listing but its product fields were not recognised. Returned fields: "+keys+". Please retry; if it repeats, share the product link and we can inspect the exact response safely.");
   }
   return NextResponse.json({platform:"aliexpress.com",sourceUrl:parsed.toString(),title,description,images,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*MARKUP_MULTIPLIER*100)/100,fx:rate?{rate,provider:"Crawlbase managed AliExpress scraper"}:null,shipping:null,shippingMessage:shippingText?"AliExpress shipping details detected ("+shippingText+"). Confirm the final Seychelles delivery fee before importing.":"No verified Seychelles delivery quote was returned. Enter the customer delivery fee manually.",supplierDataSource:"Crawlbase managed AliExpress scraper",variants,supplierDebug:{scraper:"Crawlbase managed API",productKeys:Object.keys(managed||{}),skuCount:rawVariants.length,skuPropertyCount:0,firstSkuAttributes:rawVariants[0]??null,firstSkuProperty:null,priceSource:useUrlPrice?"AliExpress pdp_npi URL price":"Crawlbase managed response",urlPrice:urlPrice??null,apiPrice:Number.isFinite(apiPrice)?apiPrice:null,apiCurrency:apiCurrency||null,rawTitle,descriptionWasStructured:typeof managedField(managed,["description","product_description","productDescription","short_description","shortDescription","details"])==="object"},specifications:managed?.specifications||[]});
  }
  const scraped=await scrapeAliExpressPage(parsed.toString());
  const productData=scraped.product||{};
  const priceModule=productData.priceModule||{};
  const priceCandidates=[priceModule.formatedActivityPrice,priceModule.formatedPrice,priceModule.minPrice?.value,priceModule.minPrice,priceModule.activityPrice,productData.price,productData.minPrice,meta(scraped.html,"product:price:amount"),meta(scraped.html,"og:price:amount")];
  const sourcePrice=priceCandidates.map(parseSupplierPrice).find((value:number)=>Number.isFinite(value)&&value>0)??NaN;
  const sourceCurrency=normaliseCurrencyCode(priceModule.currencyCode??priceModule.currency??productData.currencyCode??productData.currency??meta(scraped.html,"product:price:currency")??meta(scraped.html,"og:price:currency"));
  const title=String(productData.title??productData.subject??meta(scraped.html,"og:title")??((scraped.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"").replace(/&amp;/g,"&").trim());
  const description=String(productData.description??productData.productDescription??meta(scraped.html,"og:description")??meta(scraped.html,"description","name")??"");
  const imageModule=productData.imageModule||{};
  const images=[...(Array.isArray(imageModule.imagePathList)?imageModule.imagePathList:[]),...(Array.isArray(productData.images)?productData.images:[]),...imageCandidates(scraped.html,productData)].filter((v:any)=>typeof v==="string"&&/^https:\/\//i.test(v)).slice(0,12);
  const uniqueImages=[...new Set(images)];
  const skuRows=scraped.skuRows.map((sku:any)=>({
   ...sku,
   attributes:sku.attributes??sku.sku_attributes??sku.skuAttr??sku.properties,
   pricing:sku.pricing??{sale_price:sku.offerSalePrice??sku.skuVal?.skuAmount?.value??sku.skuVal?.skuAmount??sku.price??sku.price_scr,currency:sku.currency??sourceCurrency},
   stock:sku.stock??sku.quantity??sku.skuVal?.inventory??sku.skuVal?.availQuantity,
   image_url:sku.image_url??sku.imageUrl??sku.skuVal?.skuPropertyImagePath
  }));
  const propertyRows=scraped.propertyRows.map((property:any)=>({
   ...property,
   id:property.id??property.skuPropertyId,
   name:property.name??property.skuPropertyName,
   values:(property.values??property.skuPropertyValues??[]).map((v:any)=>({...v,id:v.id??v.propertyValueId,name:v.name??v.propertyValueName,image:v.image??v.skuPropertyImagePath}))
  }));
  let fx:any=null;
  if(sourceCurrency&&Number.isFinite(sourcePrice)&&sourcePrice>0){const convertedRate=await getScrRate(sourceCurrency);if(convertedRate)fx={rate:convertedRate,provider:"open.er-api.com (direct or USD cross-rate)"};}
  const rate=sourceCurrency==="SCR"?1:(fx?.rate||null);
  const costScr=priceInScr(sourcePrice,sourceCurrency,rate);
  const supplierDebug={productKeys:Object.keys(productData||{}),skuCount:skuRows.length,skuPropertyCount:propertyRows.length,firstSkuAttributes:skuRows[0]?.attributes??null,firstSkuProperty:propertyRows[0]??null,scraper:"self-hosted HTML extraction"};
  if(!title&&!uniqueImages.length&&!Number.isFinite(sourcePrice))throw new Error("AliExpress did not expose product details in its page HTML. It may require sign-in or be showing an anti-bot challenge. Try another product URL or complete the listing manually.");
  return NextResponse.json({platform:"aliexpress.com",sourceUrl:parsed.toString(),title,description,images:uniqueImages,sourcePrice:Number.isFinite(sourcePrice)&&sourcePrice>0?sourcePrice:null,sourceCurrency:sourceCurrency||null,exchangeRate:rate,costScr,sellingPriceScr:costScr===null?null:Math.round(costScr*MARKUP_MULTIPLIER*100)/100,fx,shipping:null,shippingMessage:"No verified Seychelles delivery quote was exposed by the supplier page. Enter the customer delivery fee manually.",supplierDataSource:"Self-hosted AliExpress HTML scraper",variants:await normaliseSkus(skuRows,Number.isFinite(sourcePrice)?sourcePrice:0,sourceCurrency,rate,propertyRows),supplierDebug,specifications:[]});
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