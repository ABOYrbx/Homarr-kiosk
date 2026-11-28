import { customType as pgCustomType } from "drizzle-orm/pg-core";
import { customType as sqliteCustomType } from "drizzle-orm/sqlite-core";

export type IdleScreenMusicSource = "homeAssistant" | "musicAssistant";

export const parseIdleMusicSources = (value: string | null): IdleScreenMusicSource[] => {
  if (value === null) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (source): source is IdleScreenMusicSource => source === "homeAssistant" || source === "musicAssistant",
    );
  } catch {
    return [];
  }
};

export const parseIdleMusicPlayerIds = (value: string | null): string[] => {
  if (value === null) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
};

// Stored as a JSON string in a text column. Custom types keep the SQL type
// unchanged while exposing the decoded arrays to both dialect schemas.
const jsonTextParams = <T>(parse: (value: string | null) => T) => ({
  dataType() {
    return "text";
  },
  toDriver(value: T) {
    return JSON.stringify(value);
  },
  fromDriver(value: string | null) {
    return parse(value);
  },
});

export const pgIdleMusicSourcesText = pgCustomType<{
  data: IdleScreenMusicSource[];
  driverData: string | null;
}>(jsonTextParams(parseIdleMusicSources));

export const sqliteIdleMusicSourcesText = sqliteCustomType<{
  data: IdleScreenMusicSource[];
  driverData: string | null;
}>(jsonTextParams(parseIdleMusicSources));

export const pgIdleMusicPlayerIdsText = pgCustomType<{
  data: string[];
  driverData: string | null;
}>(jsonTextParams(parseIdleMusicPlayerIds));

export const sqliteIdleMusicPlayerIdsText = sqliteCustomType<{
  data: string[];
  driverData: string | null;
}>(jsonTextParams(parseIdleMusicPlayerIds));
