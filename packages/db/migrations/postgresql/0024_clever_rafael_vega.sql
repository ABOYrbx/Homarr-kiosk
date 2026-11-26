ALTER TABLE "user" ALTER COLUMN "header_preferences" SET DEFAULT '{"version":4,"visible":true,"searchDisplay":"input","logoDisplay":"logoAndText","tabsDisplay":"compact","zones":{"left":[{"type":"builtin","id":"logo"}],"center":[{"type":"builtin","id":"search"}],"right":[{"type":"builtin","id":"boardTabs"},{"type":"builtin","id":"boardEdit"},{"type":"builtin","id":"boardSettings"},{"type":"builtin","id":"user"}]}}';--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_timeout_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_home_assistant_integration_id" varchar(64);--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_media_player_entity_id" text;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_show_clock_seconds" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_show_lyrics" boolean DEFAULT true NOT NULL;