"use client";

import { useEffect, useState } from "react";
import { ActionIcon, Alert, Button, ColorInput, Group, Input, Slider, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import type { UseFormReturnType } from "@homarr/form";
import { useI18n } from "@homarr/translation/client";

import { useIdleScreenPreview } from "~/components/board/idle-screen/preview-context";

import type { Board } from "../../_types";
import { IdleWidgetBackgroundFrost, IdleWidgetBackgroundSettings } from "./_idle-widget-background";
import type { FormValues } from "./_settings-form";

type CitySearchResult = RouterOutputs["location"]["searchCity"]["results"][number];

interface Props {
  form: UseFormReturnType<FormValues>;
  board: Board;
}

export const formatWidgetScale = (value: number) => `${Math.round(value * 100)} %`;

export const toIdleWeatherLocation = (
  city: Pick<CitySearchResult, "name" | "latitude" | "longitude">,
): NonNullable<FormValues["idleScreenWeatherLocation"]> => ({
  name: city.name,
  latitude: city.latitude,
  longitude: city.longitude,
});

const IdleWeatherLocationInput = ({ form, board }: Props) => {
  const t = useI18n("board");
  const tCommon = useI18n("common");
  const selectedLocationName = form.values.idleScreenWeatherLocation?.name ?? "";
  const [searchInput, setSearchInput] = useState(board.idleScreenWeatherLocation?.name ?? "");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(selectedLocationName);
  }, [selectedLocationName]);

  const { data, isPending, error, refetch } = clientApi.location.searchCity.useQuery(
    { query: submittedQuery ?? "" },
    { enabled: submittedQuery !== null, staleTime: 60_000 },
  );

  const search = () => {
    const query = searchInput.trim();
    if (!query) return;
    setSubmittedQuery(query);
  };

  const selectCity = (city: CitySearchResult) => {
    form.setFieldValue("idleScreenWeatherLocation", toIdleWeatherLocation(city));
    setSearchInput(city.name);
    setSubmittedQuery(null);
  };

  const clearLocation = () => {
    form.setFieldValue("idleScreenWeatherLocation", null);
    setSearchInput("");
    setSubmittedQuery(null);
  };

  return (
    <Stack gap="xs">
      <TextInput
        label={t("field.idleScreenWeatherLocation.label")}
        description={t("field.idleScreenWeatherLocation.description")}
        placeholder={t("field.idleScreenWeatherLocation.search")}
        value={searchInput}
        onChange={(event) => {
          setSearchInput(event.currentTarget.value);
          setSubmittedQuery(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          search();
        }}
        loading={submittedQuery !== null && isPending}
        rightSectionPointerEvents="all"
        rightSectionWidth={60}
        rightSection={
          <Group gap={4} wrap="nowrap" justify="center">
            {(selectedLocationName || searchInput) && (
              <Input.ClearButton
                type="button"
                aria-label={t("field.idleScreenWeatherLocation.clear")}
                onClick={clearLocation}
              />
            )}
            <ActionIcon
              type="button"
              variant="subtle"
              size="sm"
              aria-label={t("field.idleScreenWeatherLocation.search")}
              disabled={!searchInput.trim()}
              onClick={search}
            >
              <IconSearch size={16} />
            </ActionIcon>
          </Group>
        }
      />

      {submittedQuery !== null && (
        <Stack component="section" aria-label={t("field.idleScreenWeatherLocation.search")} gap="xs">
          {error ? (
            <Alert title={tCommon("error")} color="red">
              <Button type="button" variant="light" color="red" size="compact-sm" onClick={() => void refetch()}>
                {tCommon("action.tryAgain")}
              </Button>
            </Alert>
          ) : (
            <Stack gap="xs" mah={320} style={{ overflowY: "auto" }}>
              {!isPending && data?.results.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  {tCommon("noResults")}
                </Text>
              )}
              {data?.results.map((city) => (
                <Button
                  key={city.id}
                  type="button"
                  variant="default"
                  fullWidth
                  justify="flex-start"
                  styles={{ label: { whiteSpace: "normal", overflowWrap: "anywhere" } }}
                  onClick={() => selectCity(city)}
                >
                  {city.country ? `${city.name}, ${city.country}` : city.name}
                </Button>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export const IdlePreviewSettings = ({ form, board }: Props) => {
  const t = useI18n("board");
  const { openPreview } = useIdleScreenPreview();
  const clockColor = form.values.idleScreenClockColor ?? board.idleScreenClockColor ?? "#1b3a5c";
  const widgetScale = form.values.idleScreenWidgetScale ?? board.idleScreenWidgetScale ?? 1;

  return (
    <Stack gap="sm">
      <IdleWeatherLocationInput form={form} board={board} />
      <ColorInput
        label={t("field.idleScreenClockColor.label")}
        description={t("field.idleScreenClockColor.description")}
        placeholder="#1b3a5c"
        format="hex"
        value={clockColor}
        onChange={(value) => form.setFieldValue("idleScreenClockColor", value)}
      />
      <Input.Wrapper
        label={t("field.idleScreenWidgetScale.label")}
        description={t("field.idleScreenWidgetScale.description")}
      >
        <Slider
          thumbLabel={formatWidgetScale(widgetScale)}
          mt="xs"
          mb="sm"
          min={0.5}
          max={2}
          step={0.05}
          marks={[
            { value: 0.5, label: "50 %" },
            { value: 1, label: "100 %" },
            { value: 2, label: "200 %" },
          ]}
          value={widgetScale}
          onChange={(value) => form.setFieldValue("idleScreenWidgetScale", value)}
        />
      </Input.Wrapper>
      <IdleWidgetBackgroundSettings form={form} />
      <IdleWidgetBackgroundFrost form={form} />
      <Stack gap={2}>
        <Text fw={500}>{t("field.idleScreenPreview.label")}</Text>
        <Text size="sm" c="dimmed">
          {t("field.idleScreenPreview.description")}
        </Text>
        <Button type="button" variant="light" mt="xs" onClick={openPreview}>
          {t("field.idleScreenPreview.button")}
        </Button>
      </Stack>
    </Stack>
  );
};
