import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export const maxDuration=60;
function clients(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!anon||!key)throw new Error("Product importer is not configured.");return {auth:createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}),db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})};}
export async function POST(request:NextRequest){
 let dbForCleanup:any=null;
 let createdJobId:string|null=null;
 try{
  const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!bearer)return NextResponse.json({error:"Sign in as an administrator."},{status:401});
  const {auth,db}=clients();dbForCleanup=db;const {data:{user}}=await auth.auth.getUser(bearer);if(!user)return NextResponse.json({error:"Session expired."},{status:401});
  const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).single();if(!profile?.is_admin)return NextResponse.json({error:"Administrator access required."},{status:403});
  const body=await request.json();const sourceUrl=String(body.url||"").trim(),shopId=String(body.shopId||"");let parsed:URL;try{parsed=new URL(sourceUrl);}catch{return NextResponse.json({error:"Enter a valid AliExpress product URL."},{status:400});}
  if(parsed.protocol!=="https:"||!(parsed.hostname==="aliexpress.com"||parsed.hostname.endsWith(".aliexpress.com"))||!parsed.pathname.match(/\/item\/\d+/i))return NextResponse.json({error:"Paste a direct AliExpress product page link."},{status:400});
  const {data:shop,error:shopError}=await db.from("shops").select("id").eq("id",shopId).eq("is_active",true).single();if(shopError||!shop)return NextResponse.json({error:"Choose an active seller shop."},{status:400});
  const {data:job,error}=await db.from("admin_product_import_jobs").insert({shop_id:shopId,source_url:sourceUrl,imported_by:user.id,status:"queued",stage:"Starting",message:"Submitting product link to supplier scraper."}).select("id,shop_id,source_url,status,stage,message").single();if(error)throw new Error("Could not create import job: "+error.message);createdJobId=job.id;
  const start=await fetch(request.nextUrl.origin+"/api/admin/product-import/preview",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer},body:JSON.stringify({url:sourceUrl,startOnly:true}),signal:AbortSignal.timeout(20000),cache:"no-store"});
  const result=await start.json();if(!start.ok)throw new Error(result.error||"Could not start supplier extraction.");
  const snapshotId=String(result.snapshotId||"");if(!snapshotId)throw new Error("Supplier scraper did not return a tracking ID.");
  const {error:updateError}=await db.from("admin_product_import_jobs").update({status:"processing",stage:"Supplier extraction",message:"Product extraction is running. This page will update automatically.",snapshot_id:snapshotId,updated_at:new Date().toISOString()}).eq("id",job.id);
  if(updateError){await db.from("admin_product_import_jobs").update({status:"failed",stage:"Tracking save failed",message:"Bright Data started the scrape, but IslandXpress could not save its tracking ID. This attempt cannot be resumed; start a new import.",error:updateError.message,updated_at:new Date().toISOString()}).eq("id",job.id);throw new Error("Bright Data started the scrape, but Supabase could not save its tracking ID: "+updateError.message+". The job has been marked failed; check the database migration/schema cache, then start a new import.");}
  return NextResponse.json({success:true,job:{...job,status:"processing",stage:"Supplier extraction",message:"Product extraction is running. This page will update automatically."}});
 }catch(e){
  const message=e instanceof Error?e.message:"Could not start product import.";
  if(createdJobId&&dbForCleanup){await dbForCleanup.from("admin_product_import_jobs").update({status:"failed",stage:"Could not start",message:"The supplier scrape could not be started. You can safely try again.",error:message,updated_at:new Date().toISOString()}).eq("id",createdJobId).in("status",["queued","processing"]);}
  return NextResponse.json({error:message},{status:400});
 }
}