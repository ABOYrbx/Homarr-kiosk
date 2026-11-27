"use client";

import type { CSSProperties } from "react";
import { Box, Group, Stack, Text } from "@mantine/core";

import { clientApi } from "@homarr/api/client";
import type { Board } from "@homarr/boards/layout-data";
import { WeatherIcon } from "@homarr/widgets/weather-icon";

import { AnalogClock } from "./analog-clock";
import classes from "./idle-screen.module.css";

interface IdleWeatherSettings {
  idleScreenWeatherLocation: {
    name?: string;
    latitude: number;
    longitude: number;
  } | null;
}

interface IdleClockSurfaceSettings extends IdleWeatherSettings {
  idleScreenShowClockSeconds: boolean;
  idleScreenClockColor: string;
}

const defaultIdleWeatherLocation = {
  name: "Paris",
  latitude: 48.85341,
  longitude: 2.3488,
} as const;

const isCoordinateInput = (value: unknown): value is { latitude: number; longitude: number } =>
  typeof value === "object" &&
  value !== null &&
  "latitude" in value &&
  typeof value.latitude === "number" &&
  Number.isFinite(value.latitude) &&
  value.latitude >= -90 &&
  value.latitude <= 90 &&
  "longitude" in value &&
  typeof value.longitude === "number" &&
  Number.isFinite(value.longitude) &&
  value.longitude >= -180 &&
  value.longitude <= 180;

export const getIdleWeatherInput = (board: Board, settings: IdleWeatherSettings) => {
  const configuredLocation = settings.idleScreenWeatherLocation;
  if (isCoordinateInput(configuredLocation)) {
    return { latitude: configuredLocation.latitude, longitude: configuredLocation.longitude };
  }

  const firstCandidate = board.items.find((item) => item.kind === "weather" || item.kind === "clock");
  if (!firstCandidate) {
    return { latitude: defaultIdleWeatherLocation.latitude, longitude: defaultIdleWeatherLocation.longitude };
  }

  const location =
    firstCandidate.kind === "weather" ? firstCandidate.options.location : firstCandidate.options.weatherLocation;
  if (isCoordinateInput(location)) {
    return { latitude: location.latitude, longitude: location.longitude };
  }

  return { latitude: defaultIdleWeatherLocation.latitude, longitude: defaultIdleWeatherLocation.longitude };
};

export const IdleClockSurface = ({ board, settings }: { board: Board; settings: IdleClockSurfaceSettings }) => {
  const input = getIdleWeatherInput(board, settings);
  const { data: weather } = clientApi.widget.weather.atLocation.useQuery(input);

  return (
    <Box
      className={classes.clockSurface}
      style={{ "--idle-clock-color": settings.idleScreenClockColor } as CSSProperties}
    >
      <Box className={classes.clockFrost} aria-hidden="true" />
      <Stack className={classes.clockContent} align="center" gap="xl">
        {weather && (
          <Group align="center" gap="md" wrap="nowrap">
            <WeatherIcon
              code={weather.current.weatherCode}
              isDay={weather.current.isDay}
              size={44}
              style={{ float: "none" }}
            />
            <Text size="clamp(1.5rem, 2.4vw, 2.25rem)" fw={500} c="#f7f7f7">
              {`${weather.current.temperature.toFixed(1)}°C`}
            </Text>
          </Group>
        )}
        <AnalogClock showSeconds={settings.idleScreenShowClockSeconds} />
      </Stack>
    </Box>
  );
};
