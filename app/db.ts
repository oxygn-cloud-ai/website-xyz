import {env} from 'cloudflare:workers';
export function leadsDb(){return (env as unknown as {DB:D1Database}).DB}
