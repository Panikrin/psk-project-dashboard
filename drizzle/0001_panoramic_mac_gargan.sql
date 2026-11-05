CREATE TABLE `ticktick_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`secret_cipher` text NOT NULL,
	`config` text NOT NULL,
	`last_success` text,
	`last_error` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
