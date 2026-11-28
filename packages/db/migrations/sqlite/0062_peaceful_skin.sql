ALTER TABLE `board` ADD `idle_screen_music_sources` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_music_selection_mode` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_music_player_filter_mode` text DEFAULT 'exclude' NOT NULL;--> statement-breakpoint
ALTER TABLE `board` ADD `idle_screen_music_player_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `board` SET `idle_screen_music_sources` = CASE
  WHEN `idle_screen_home_assistant_integration_id` IS NOT NULL AND `idle_screen_media_player_entity_id` IS NOT NULL AND `idle_screen_music_assistant_integration_id` IS NOT NULL AND `idle_screen_music_assistant_queue_id` IS NOT NULL THEN '["homeAssistant","musicAssistant"]'
  WHEN `idle_screen_home_assistant_integration_id` IS NOT NULL AND `idle_screen_media_player_entity_id` IS NOT NULL THEN '["homeAssistant"]'
  WHEN `idle_screen_music_assistant_integration_id` IS NOT NULL AND `idle_screen_music_assistant_queue_id` IS NOT NULL THEN '["musicAssistant"]'
  ELSE '[]'
END;
