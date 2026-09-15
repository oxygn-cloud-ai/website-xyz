export type Lead={name:string;email:string;institution:string;message:string};

const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseLead(body:unknown):Lead|null{
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const values=body as Record<string,unknown>;
  const name=String(values.name??'').trim();
  const workEmail=String(values.email??'').trim().toLowerCase();
  const institution=String(values.institution??'').trim();
  const message=String(values.message??'').trim();
  if(values.website||!name||name.length>120||!email.test(workEmail)||workEmail.length>254||institution.length>160||!message||message.length>5000)return null;
  return {name,email:workEmail,institution,message};
}
