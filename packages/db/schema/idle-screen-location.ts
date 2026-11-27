import { customType as pgCustomType } from "drizzle-orm/pg-core";
import { customType as sqliteCustomType } from "drizzle-orm/sqlite-core";

export interface IdleScreenWeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export const parseIdleScreenWeatherLocation = (value: string | null): IdleScreenWeatherLocation | null => {
  if (value === null) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    if (!("name" in parsed) || typeof parsed.name !== "string") return null;
    if (!("latitude" in parsed) || typeof parsed.latitude !== "number" || !Number.isFinite(parsed.latitude)) {
      return null;
    }
    if (parsed.latitude < -90 || parsed.latitude > 90) return null;
    if (!("longitude" in parsed) || typeof parsed.longitude !== "number" || !Number.isFinite(parsed.longitude)) {
      return null;
    }
    if (parsed.longitude < -180 || parsed.longitude > 180) return null;

    return { name: parsed.name, latitude: parsed.latitude, longitude: parsed.longitude };
  } catch {
    return null;
  }
};

// Stored as a JSON string in a text column. Custom types keep the SQL type
// unchanged while exposing the decoded object to both dialect schemas.
const jsonTextParams = {
  dataType() {
    return "text";
  },
  toDriver(value: IdleScreenWeatherLocation | null) {
    return value === null ? null : JSON.stringify(value);
  },
  fromDriver(value: string | null) {
    return parseIdleScreenWeatherLocation(value);
  },
};

export const pgIdleWeatherLocationText = pgCustomType<{
  data: IdleScreenWeatherLocation | null;
  driverData: string | null;
}>(jsonTextParams);

export const sqliteIdleWeatherLocationText = sqliteCustomType<{
  data: IdleScreenWeatherLocation | null;
  driverData: string | null;
}>(jsonTextParams);
