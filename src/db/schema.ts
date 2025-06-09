import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';

export const listingsTable = pgTable('listings', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	itemId: varchar({ length: 255 }).notNull(),
});
