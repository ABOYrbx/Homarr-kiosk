import { customType as pgCustomType } from "drizzle-orm/pg-core";
import { customType as sqliteCustomType } from "drizzle-orm/sqlite-core";

export interface IdleScreenWeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

// Stored as a JSON string in a text column. Custom types keep the SQL type
// unchanged while exposing the decoded object to both dialect schemas.
const jsonTextParams = {
  dataType() {
    return "text";
  },
  toDriver(value: IdleScreenWeatherLocation) {
    return JSON.stringify(value);
  },
  fromDriver(value: string) {
    return JSON.parse(value) as IdleScreenWeatherLocation;
  },
};

export const pgIdleWeatherLocationText = pgCustomType<{
  data: IdleScreenWeatherLocation;
  driverData: string;
}>(jsonTextParams);

export const sqliteIdleWeatherLocationText = sqliteCustomType<{
  data: IdleScreenWeatherLocation;
  driverData: string;
}>(jsonTextParams);
