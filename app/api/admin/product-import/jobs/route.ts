import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const maxDuration = 300;

function clients() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!key) throw new Error("Product importer is not configured.");
  return { auth:createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}), db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) };
}
async function runJob(origin:string, accessToken:string, job:any, db:any) {
  const update=async(patch:any)=>{await db.from("admin_product_import_jobs").update({...patch,updated_at:new Date().toISOString()}).eq("id",job.id);};
  try {
    await update({status:"processing",stage:"Extracting product",message:"Retrieving product details and images. Bright Data is starting a background scrape; completion time depends on AliExpress."});
    // Bright Data's /trigger endpoint returns a snapshot ID immediately. Poll the
    // snapshot independently instead of waiting on the synchronous /scrape endpoint.
    const startResponse=await fetch(origin+"/api/admin/product-import/preview",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({url:job.source_url,startOnly:true}),signal:AbortSignal.timeout(20000),cache:"no-store"});
    const started=await startResponse.json();
    if(!startResponse.ok) throw new Error(started.error||"Could not start the Bright Data scrape.");
    const snapshotId=String(started.snapshotId||"");
    if(!snapshotId) throw new Error("Bright Data did not provide a snapshot ID.");
    await update({stage:"Supplier extraction",message:"Bright Data is collecting the product details. This runs independently of the website request."});
    const brightDataToken=process.env.BRIGHTDATA_API_TOKEN;
    if(!brightDataToken) throw new Error("BRIGHTDATA_API_TOKEN is missing from the server environment.");
    const deadline=Date.now()+240000;
    let ready=false;
    let lastStatus="starting";
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,5000));
      const progressResponse=await fetch("https://api.brightdata.com/datasets/v3/progress/"+encodeURIComponent(snapshotId),{headers:{Authorization:"Bearer "+brightDataToken,Accept:"application/json"},signal:AbortSignal.timeout(10000),cache:"no-store"});
      const progressText=await progressResponse.text();
      let progress:any;
      try{progress=JSON.parse(progressText);}catch{throw new Error("Bright Data progress check returned HTTP "+progressResponse.status+" with an unreadable response.");}
      if(!progressResponse.ok) throw new Error("Bright Data progress check failed (HTTP "+progressResponse.status+"): "+String(progress.error||progress.message||progressText).slice(0,250));
      lastStatus=String(progress.status||"unknown");
      if(lastStatus==="failed") throw new Error("Bright Data reported that the AliExpress scrape failed. Check the Bright Data dataset run log.");
      if(lastStatus==="ready"){ready=true;break;}
      await update({stage:"Supplier extraction",message:"Bright Data status: "+lastStatus+". Waiting for the product record…"});
    }
    if(!ready) throw new Error("Bright Data is still processing after 4 minutes (snapshot "+snapshotId+"). The scrape was not discarded; please retry later or check this snapshot in Bright Data.");
    const previewResponse=await fetch(origin+"/api/admin/product-import/preview",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({url:job.source_url,snapshotId}),signal:AbortSignal.timeout(45000),cache:"no-store"});
    const preview=await previewResponse.json();
    if(!previewResponse.ok) throw new Error(preview.error||"Bright Data finished but product extraction failed.");
    const title=typeof preview.title==="string"?preview.title.trim():"";
    if(!title||/^(not found|page not found|access denied|error)$/i.test(title)) throw new Error("Supplier did not return a valid product title. No product was created.");
    const price=Number(preview.sellingPriceScr);
    if(!Number.isFinite(price)||price<=0) throw new Error("Supplier price could not be converted to a valid SCR amount. No product was created.");
    if(!Array.isArray(preview.images)||preview.images.length===0) throw new Error("Supplier did not return product images. No product was created.");
    if(typeof preview.description!=="string") throw new Error("Supplier description was not readable text. No product was created.");
    await update({stage:"Saving product",message:"Product details extracted. Saving images, variations and pricing to the seller shop."});
    const variants=Array.isArray(preview.variants)?preview.variants:[];
    const stock=variants.length?variants.reduce((sum:number,v:any)=>sum+Math.max(0,Number(v.stock)||0),0):1;
    const createResponse=await fetch(origin+"/api/admin/product-import/create",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({shopId:job.shop_id,title,description:preview.description||"",category:"Other",price,shipping:0,stock,variants,images:Array.isArray(preview.images)?preview.images:[],sourceUrl:preview.sourceUrl||job.source_url,platform:preview.platform||"aliexpress.com",sourcePrice:preview.sourcePrice,sourceCurrency:preview.sourceCurrency,exchangeRate:preview.exchangeRate,costScr:preview.costScr,supplierShippingAvailable:false}),signal:AbortSignal.timeout(180000),cache:"no-store"});
    const created=await createResponse.json();
    if(!createResponse.ok) throw new Error(created.error||"Could not save the imported product.");
    await update({status:"completed",stage:"Complete",message:"Product imported successfully and submitted for admin review.",product_id:created.productId,error:null});
  } catch(e) {
    const message=e instanceof Error?e.message:"Product import failed.";
    await update({status:"failed",stage:"Needs attention",message,error:message});
  }
}
export async function POST(request:NextRequest) {
  try {
    const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(!bearer) return NextResponse.json({error:"Sign in as an administrator."},{status:401});
    const {auth,db}=clients();
    const {data:{user}}=await auth.auth.getUser(bearer);
    if(!user) return NextResponse.json({error:"Session expired."},{status:401});
    const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).single();
    if(!profile?.is_admin) return NextResponse.json({error:"Administrator access required."},{status:403});
    const body=await request.json();
    const sourceUrl=String(body.url||"").trim(), shopId=String(body.shopId||"");
    let parsed:URL;
    try{parsed=new URL(sourceUrl);}catch{return NextResponse.json({error:"Enter a valid supplier product URL."},{status:400});}
    const host=parsed.hostname.toLowerCase();
    if(parsed.protocol!=="https:"||!(host==="aliexpress.com"||host.endsWith(".aliexpress.com"))) return NextResponse.json({error:"Instant background import currently supports AliExpress product links."},{status:400});
    const {data:shop,error:shopError}=await db.from("shops").select("id").eq("id",shopId).eq("is_active",true).single();
    if(shopError||!shop) return NextResponse.json({error:"Choose an active seller shop."},{status:400});
    const {data:job,error}=await db.from("admin_product_import_jobs").insert({shop_id:shopId,source_url:sourceUrl,imported_by:user.id}).select("id,shop_id,source_url,status,stage,message").single();
    if(error) throw new Error("Could not queue import. Apply the product-import jobs database migration first. "+error.message);
    waitUntil(runJob(request.nextUrl.origin,bearer,job,db));
    return NextResponse.json({success:true,job});
  } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Could not start product import."},{status:400}); }
}
