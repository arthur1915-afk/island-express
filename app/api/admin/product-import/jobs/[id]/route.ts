import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:{id:string}}){
 try{
  const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!bearer)return NextResponse.json({error:"Sign in as an administrator."},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!key)throw new Error("Product importer is not configured.");
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}),db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user}}=await auth.auth.getUser(bearer);if(!user)return NextResponse.json({error:"Session expired."},{status:401});
  const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).single();if(!profile?.is_admin)return NextResponse.json({error:"Administrator access required."},{status:403});
  const {data,error}=await db.from("admin_product_import_jobs").select("id,status,stage,message,product_id,error,created_at,updated_at").eq("id",params.id).eq("imported_by",user.id).single();
  if(error||!data)return NextResponse.json({error:"Import job not found."},{status:404});
  return NextResponse.json({job:data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not read import status."},{status:400});}
}
