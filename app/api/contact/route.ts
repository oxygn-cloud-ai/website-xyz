import {leadsDb} from '../../db';
import {parseLead} from './validation';

export async function POST(request:Request){
  const lead=parseLead(await request.json().catch(()=>null));
  if(!lead)return Response.json({error:'Please check the form and try again.'},{status:400});
  try{
    await leadsDb().prepare('INSERT INTO leads (id, name, email, institution, message, status) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),lead.name,lead.email,lead.institution||null,lead.message,'new').run();
    return Response.json({ok:true});
  }catch(error){
    console.error('Lead submission failed',error);
    return Response.json({error:'We could not save your request. Please try again.'},{status:500});
  }
}
