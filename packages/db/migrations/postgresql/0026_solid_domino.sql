ALTER TABLE "board" ADD COLUMN "idle_screen_weather_location" text;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "idle_screen_clock_color" text DEFAULT '#1b3a5c' NOT NULL;