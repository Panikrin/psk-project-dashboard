CREATE TABLE `commercial_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_commercial` (
	`project` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
