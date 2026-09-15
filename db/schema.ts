import {sql} from 'drizzle-orm';
import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';

export const leads=sqliteTable('leads',{
  id:text('id').primaryKey(),
  name:text('name').notNull(),
  email:text('email').notNull(),
  institution:text('institution'),
  message:text('message').notNull(),
  status:text('status').notNull().default('new'),
  createdAt:integer('created_at',{mode:'timestamp'}).notNull().default(sql`(unixepoch())`),
});
