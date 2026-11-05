CREATE TABLE `project_media` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_profiles` (
	`project` text PRIMARY KEY NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`cover_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
