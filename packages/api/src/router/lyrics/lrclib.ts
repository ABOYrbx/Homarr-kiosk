import type { LrclibRecord } from "./types";
import { lrclibRecordSchema } from "./types";

const BASE = "https://lrclib.net";
const REQUEST_TIMEOUT_MS = 5_000;
const USER_AGENT = "Homarr idle screen (+https://github.com/ABOYrbx/Homarr-kiosk)";

type FetchInput = {
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
};

type FetchResult = { status: "ok"; record: LrclibRecord } | { status: "not_found" } | { status: "error" };

/**
 * Single keyless request to the fixed LRCLIB host. The caller only supplies
 * search parameters, never a URL or credentials. No retries, no logging of
 * responses; malformed data is reported as an error rather than surfaced.
 */
export const fetchLrclibLyrics = async (input: FetchInput): Promise<FetchResult> => {
  const artist = input.artist?.trim();
  if (!artist) return { status: "not_found" };

  const params = new URLSearchParams({ track_name: input.title, artist_name: artist });
  if (input.album !== undefined) params.set("album_name", input.album);
  if (input.durationSeconds !== undefined) params.set("duration", String(input.durationSeconds));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}/api/get?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });

    if (response.status === 404) return { status: "not_found" };
    if (response.status < 200 || response.status >= 300) return { status: "error" };

    const parsed = lrclibRecordSchema.safeParse(await response.json());
    if (!parsed.success) return { status: "error" };
    return { status: "ok", record: parsed.data };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timeout);
  }
};
