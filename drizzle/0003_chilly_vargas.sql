CREATE TABLE `login_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_drive` (
	`project` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_auth` (
	`id` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`auth_version` integer NOT NULL,
	`expires_at` integer NOT NULL
);
