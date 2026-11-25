import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export const maxDuration=120;
export async function GET(request:NextRequest,{params}:{params:{id:string}}){
 try{
  const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!bearer)return NextResponse.json({error:"Sign in as an administrator."},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!anon||!key)throw new Error("Product importer is not configured.");
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}),db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user}}=await auth.auth.getUser(bearer);if(!user)return NextResponse.json({error:"Session expired."},{status:401});
  const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).single();if(!profile?.is_admin)return NextResponse.json({error:"Administrator access required."},{status:403});
  const {data:job,error}=await db.from("admin_product_import_jobs").select("id,status,stage,message,product_id,error,created_at,updated_at,shop_id,source_url,snapshot_id").eq("id",params.id).eq("imported_by",user.id).single();
  if(error||!job)return NextResponse.json({error:"Import job not found."},{status:404});
  if(job.status==="finalizing"&&Date.now()-new Date(job.updated_at).getTime()>5*60*1000){
   // Do not automatically retry product creation: the previous request may have
   // saved the product before being interrupted. Stop the job and require a
   // product-list check before retrying, avoiding accidental duplicate listings.
   await db.from("admin_product_import_jobs").update({status:"failed",stage:"Finalization interrupted",message:"Product saving took too long and the result could not be confirmed. Check the product list before starting another import to avoid duplicates.",error:"The finalization request exceeded its 5-minute recovery window. Check whether the product was created before retrying.",updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","finalizing");
  }
  if(job.status==="processing"&&job.snapshot_id){
   const token=process.env.BRIGHTDATA_API_TOKEN;if(!token)throw new Error("BRIGHTDATA_API_TOKEN is missing on the server.");
   const progressResponse=await fetch("https://api.brightdata.com/datasets/v3/progress/"+encodeURIComponent(job.snapshot_id),{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(10000),cache:"no-store"});
   const raw=await progressResponse.text();let progress:any;try{progress=JSON.parse(raw);}catch{throw new Error("Bright Data returned an unreadable progress response (HTTP "+progressResponse.status+").");}
   if(!progressResponse.ok)throw new Error("Bright Data progress check failed (HTTP "+progressResponse.status+"): "+String(progress.error||progress.message||raw).slice(0,250));
   const state=String(progress.status||"unknown");
   if(state==="failed"){
    await db.from("admin_product_import_jobs").update({status:"failed",stage:"Scrape failed",message:"The supplier scraper could not collect this product.",error:"Bright Data reported a failed scrape. Check the Bright Data snapshot run details.",updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","processing");
   }else if(state==="ready"){
    // Claim finalization atomically so two browser polls cannot create duplicates.
    const {data:claim}=await db.from("admin_product_import_jobs").update({status:"finalizing",stage:"Preparing product",message:"Product details are ready. Saving the product now.",updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","processing").select("id").maybeSingle();
    if(claim){
     try{
      const origin=request.nextUrl.origin;
      const previewResponse=await fetch(origin+"/api/admin/product-import/preview",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer},body:JSON.stringify({url:job.source_url,snapshotId:job.snapshot_id}),signal:AbortSignal.timeout(45000),cache:"no-store"});
      const preview=await previewResponse.json();if(!previewResponse.ok)throw new Error(preview.error||"Could not read the supplier product record.");
      const title=typeof preview.title==="string"?preview.title.trim():"";const price=Number(preview.sellingPriceScr);
      if(!title||!Number.isFinite(price)||price<=0||!Array.isArray(preview.images)||!preview.images.length)throw new Error("Supplier data is incomplete. A valid title, SCR price and product images are required.");
      const variants=Array.isArray(preview.variants)?preview.variants:[];const stock=variants.length?variants.reduce((sum:number,v:any)=>sum+Math.max(0,Number(v.stock)||0),0):1;
      const createResponse=await fetch(origin+"/api/admin/product-import/create",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer},body:JSON.stringify({shopId:job.shop_id,title,description:preview.description||"",category:"Other",price,shipping:0,stock,variants,images:preview.images,sourceUrl:preview.sourceUrl||job.source_url,platform:preview.platform||"aliexpress.com",sourcePrice:preview.sourcePrice,sourceCurrency:preview.sourceCurrency,exchangeRate:preview.exchangeRate,costScr:preview.costScr,supplierShippingAvailable:false}),signal:AbortSignal.timeout(90000),cache:"no-store"});
      const created=await createResponse.json();if(!createResponse.ok)throw new Error(created.error||"Could not save the imported product.");
      await db.from("admin_product_import_jobs").update({status:"completed",stage:"Complete",message:"Product imported and submitted for admin review.",product_id:created.productId,error:null,updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","finalizing");
     }catch(finalizeError){const message=finalizeError instanceof Error?finalizeError.message:"Product finalization failed.";await db.from("admin_product_import_jobs").update({status:"failed",stage:"Needs attention",message,error:message,updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","finalizing");}
    }
   }else{
    await db.from("admin_product_import_jobs").update({stage:"Supplier extraction",message:state==="starting"?"Supplier scraper is starting…":"Supplier is collecting product details…",updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","processing");
   }
  }
  const {data:latest}=await db.from("admin_product_import_jobs").select("id,status,stage,message,product_id,error,created_at,updated_at").eq("id",job.id).single();
  return NextResponse.json({job:latest||job});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not update import status."},{status:400});}
}