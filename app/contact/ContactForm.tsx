'use client';
import {FormEvent,useState} from 'react';

export default function ContactForm(){
  const [state,setState]=useState<'idle'|'sending'|'sent'|'error'>('idle');
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setState('sending');
    const form=event.currentTarget;
    const response=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))}).catch(()=>null);
    if(response?.ok){form.reset();setState('sent')}else setState('error');
  }
  return <form onSubmit={submit}><label>Name<input name="name" maxLength={120} required/></label><label>Work email<input type="email" name="email" maxLength={254} required/></label><label>Institution<input name="institution" maxLength={160}/></label><label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label><label>How can we help?<textarea name="message" rows={6} maxLength={5000} required/></label><button className="btn primary" type="submit" disabled={state==='sending'}>{state==='sending'?'Saving…':'Request a demo'}</button><p className={`form-status ${state}`} role="status" aria-live="polite">{state==='sent'?'Thanks — your request has been logged.':state==='error'?'Something went wrong. Please try again.':''}</p></form>
}
