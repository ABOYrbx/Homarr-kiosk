PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`email_verified` integer,
	`image` text,
	`password` text,
	`provider` text DEFAULT 'credentials' NOT NULL,
	`home_board_id` text,
	`mobile_home_board_id` text,
	`default_search_engine_id` text,
	`open_search_in_new_tab` integer DEFAULT true NOT NULL,
	`ddg_bangs` integer DEFAULT true NOT NULL,
	`color_scheme` text DEFAULT 'dark' NOT NULL,
	`byte_unit_system` text DEFAULT 'decimal' NOT NULL,
	`first_day_of_week` integer DEFAULT 1 NOT NULL,
	`ping_icons_enabled` integer DEFAULT false NOT NULL,
	`enable_right_click_on_widgets` integer DEFAULT true NOT NULL,
	`header_preferences` text DEFAULT '{"version":4,"visible":true,"searchDisplay":"input","logoDisplay":"logoAndText","tabsDisplay":"compact","zones":{"left":[{"type":"builtin","id":"logo"}],"center":[{"type":"builtin","id":"search"}],"right":[{"type":"builtin","id":"boardTabs"},{"type":"builtin","id":"boardEdit"},{"type":"builtin","id":"boardSettings"},{"type":"builtin","id":"user"}]}}' NOT NULL,
	`completed_manage_tour` integer DEFAULT false NOT NULL,
	`completed_board_tour` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`home_board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`mobile_home_board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`default_search_engine_id`) REFERENCES `search_engine`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "password", "provider", "home_board_id", "mobile_home_board_id", "default_search_engine_id", "open_search_in_new_tab", "ddg_bangs", "color_scheme", "byte_unit_system", "first_day_of_week", "ping_icons_enabled", "enable_right_click_on_widgets", "header_preferences", "completed_manage_tour", "completed_board_tour") SELECT "id", "name", "email", "email_verified", "image", "password", "provider", "home_board_id", "mobile_home_board_id", "default_search_engine_id", "open_search_in_new_tab", "ddg_bangs", "color_scheme", "byte_unit_system", "first_day_of_week", "ping_icons_enabled", "enable_right_click_on_widgets", "header_preferences", "completed_manage_tour", "completed_board_tour" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_timeout_minutes` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_mode` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_home_assistant_integration_id` text;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_media_player_entity_id` text;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_show_clock_seconds` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_show_lyrics` integer DEFAULT true NOT NULL;