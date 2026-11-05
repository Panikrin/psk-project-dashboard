import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const dashboard = sqliteTable('dashboard', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
export const ticktickConnection = sqliteTable('ticktick_connection', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  secretCipher: text('secret_cipher').notNull(),
  config: text('config').notNull(),
  lastSuccess: text('last_success'),
  lastError: text('last_error'),
  lockUntil: integer('lock_until').notNull().default(0),
});
export const projectProfiles = sqliteTable('project_profiles', {
  project: text('project').primaryKey(),
  address: text('address').notNull().default(''),
  coverId: text('cover_id'),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
export const projectMedia = sqliteTable('project_media', {
  id: text('id').primaryKey(),
  project: text('project').notNull(),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});
export const teamAuth = sqliteTable('team_auth', {id:text('id').primaryKey(),salt:text('salt').notNull(),passwordHash:text('password_hash').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull()});
export const teamSessions = sqliteTable('team_sessions', {idHash:text('id_hash').primaryKey(),authVersion:integer('auth_version').notNull(),expiresAt:integer('expires_at').notNull()});
export const loginLimits = sqliteTable('login_limits', {id:text('id').primaryKey(),attempts:integer('attempts').notNull().default(0),expiresAt:integer('expires_at').notNull()});
export const projectDrive = sqliteTable('project_drive', {project:text('project').primaryKey(),folderId:text('folder_id').notNull(),updatedAt:text('updated_at').notNull()});
export const projectCommercial = sqliteTable('project_commercial', {
  project: text('project').primaryKey(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
export const commercialHistory = sqliteTable('commercial_history', {
  id: text('id').primaryKey(),
  project: text('project').notNull(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  createdAt: text('created_at').notNull(),
}, table=>[uniqueIndex('commercial_history_project_revision').on(table.project,table.revision)]);
