"use client";

import { useEffect, useMemo } from "react";
import { Checkbox, Group, Input, ScrollArea, SegmentedControl, Select, Stack, Text } from "@mantine/core";

import { clientApi } from "@homarr/api/client";
import type { UseFormReturnType } from "@homarr/form";
import { useI18n } from "@homarr/translation/client";

import type { FormValues } from "./_settings-form";

interface Props {
  form: UseFormReturnType<FormValues>;
}

type MusicSource = FormValues["idleScreenMusicSources"][number];

interface PlayerOption {
  value: string;
  label: string;
}

export const IdleMusicSourcesSettings = ({ form }: Props) => {
  const t = useI18n("board");

  const { data: integrations = [] } = clientApi.integration.all.useQuery(undefined, {
    staleTime: 60_000,
  });

  const homeAssistantIntegrations = useMemo(
    () => integrations.filter((integration) => integration.kind === "homeAssistant"),
    [integrations],
  );
  const musicAssistantIntegrations = useMemo(
    () => integrations.filter((integration) => integration.kind === "musicAssistant"),
    [integrations],
  );

  const homeAssistantIntegrationId = form.values.idleScreenHomeAssistantIntegrationId;
  const { data: catalog } = clientApi.widget.smartHome.searchCatalog.useQuery(
    { integrationId: homeAssistantIntegrationId ?? "", domains: ["media_player"], query: "", limit: 100 },
    { enabled: Boolean(homeAssistantIntegrationId), staleTime: 60_000 },
  );
  const mediaPlayers = useMemo(() => catalog?.entities ?? [], [catalog]);

  useEffect(() => {
    // Wait for the catalog before validating: an empty array while loading
    // would silently clear a previously saved entity.
    if (!homeAssistantIntegrationId || !catalog) return;
    const selected = form.values.idleScreenMediaPlayerEntityId;
    if (selected && !mediaPlayers.some((entity) => entity.id === selected)) {
      form.setFieldValue("idleScreenMediaPlayerEntityId", null);
    }
  }, [homeAssistantIntegrationId, catalog, mediaPlayers, form]);

  const musicAssistantIntegrationId = form.values.idleScreenMusicAssistantIntegrationId;
  const { data: queuesData } = clientApi.musicAssistant.queues.useQuery(
    { integrationId: musicAssistantIntegrationId ?? "" },
    { enabled: Boolean(musicAssistantIntegrationId), staleTime: 60_000 },
  );
  const musicAssistantQueues = useMemo(() => queuesData?.queues ?? [], [queuesData]);

  useEffect(() => {
    // Wait for the queue list before validating: an empty array while loading
    // would silently clear a previously saved queue.
    if (!musicAssistantIntegrationId || !queuesData) return;
    const selected = form.values.idleScreenMusicAssistantQueueId;
    if (selected && !musicAssistantQueues.some((queue) => queue.id === selected)) {
      form.setFieldValue("idleScreenMusicAssistantQueueId", null);
    }
  }, [musicAssistantIntegrationId, queuesData, musicAssistantQueues, form]);

  const sources = form.values.idleScreenMusicSources;
  const selectionMode = form.values.idleScreenMusicSelectionMode;
  const homeAssistantActive = sources.includes("homeAssistant");
  const musicAssistantActive = sources.includes("musicAssistant");

  const players = useMemo<PlayerOption[]>(() => {
    const sourceLabel = (prefix: "ha" | "ma") =>
      prefix === "ha"
        ? t("field.idleScreenMusicSources.homeAssistant")
        : t("field.idleScreenMusicSources.musicAssistant");
    const options: PlayerOption[] = [];
    const homeAssistantName =
      homeAssistantIntegrations.find((integration) => integration.id === homeAssistantIntegrationId)?.name ??
      homeAssistantIntegrationId ??
      "";
    const musicAssistantName =
      musicAssistantIntegrations.find((integration) => integration.id === musicAssistantIntegrationId)?.name ??
      musicAssistantIntegrationId ??
      "";

    if (homeAssistantIntegrationId) {
      for (const entity of mediaPlayers) {
        options.push({
          value: `ha:${homeAssistantIntegrationId}:${entity.id}`,
          label: `${entity.name} · ${sourceLabel("ha")} · ${homeAssistantName}`,
        });
      }
    }
    if (musicAssistantIntegrationId) {
      for (const queue of musicAssistantQueues) {
        options.push({
          value: `ma:${musicAssistantIntegrationId}:${queue.id}`,
          label: `${queue.name} · ${sourceLabel("ma")} · ${musicAssistantName}`,
        });
      }
    }

    // Saved players stay listed even when their source is disabled or their
    // entity/queue is no longer in the catalog, so they remain editable.
    const known = new Set(options.map((option) => option.value));
    for (const id of form.values.idleScreenMusicPlayerIds) {
      if (known.has(id)) continue;
      known.add(id);
      const first = id.indexOf(":");
      const second = id.indexOf(":", first + 1);
      const prefix = id.slice(0, first);
      const integrationId = id.slice(first + 1, second);
      const playerId = id.slice(second + 1);
      const integrationName =
        integrations.find((integration) => integration.id === integrationId)?.name ?? integrationId;
      const label =
        prefix === "ha" || prefix === "ma" ? `${playerId} · ${sourceLabel(prefix)} · ${integrationName}` : id;
      options.push({ value: id, label });
    }

    return options;
  }, [
    homeAssistantIntegrationId,
    homeAssistantIntegrations,
    mediaPlayers,
    musicAssistantIntegrationId,
    musicAssistantIntegrations,
    musicAssistantQueues,
    integrations,
    form.values.idleScreenMusicPlayerIds,
    t,
  ]);

  const toggleSource = (source: MusicSource, checked: boolean) => {
    form.setFieldValue(
      "idleScreenMusicSources",
      checked ? [...sources, source] : sources.filter((current) => current !== source),
    );
  };

  return (
    <Stack gap="sm">
      <Input.Wrapper
        labelElement="div"
        label={t("field.idleScreenMusicSources.label")}
        description={t("field.idleScreenMusicSources.description")}
      >
        <Group mt="xs" gap="lg">
          <Checkbox
            label={t("field.idleScreenMusicSources.homeAssistant")}
            checked={homeAssistantActive}
            onChange={(event) => toggleSource("homeAssistant", event.currentTarget.checked)}
          />
          <Checkbox
            label={t("field.idleScreenMusicSources.musicAssistant")}
            checked={musicAssistantActive}
            onChange={(event) => toggleSource("musicAssistant", event.currentTarget.checked)}
          />
        </Group>
      </Input.Wrapper>

      <Input.Wrapper
        labelElement="div"
        label={t("field.idleScreenMusicSelectionMode.label")}
        description={t("field.idleScreenMusicSelectionMode.description")}
      >
        <SegmentedControl<"fixed" | "auto">
          mt="xs"
          fullWidth
          value={selectionMode}
          onChange={(value) => form.setFieldValue("idleScreenMusicSelectionMode", value)}
          data={[
            { value: "fixed", label: t("field.idleScreenMusicSelectionMode.fixed") },
            { value: "auto", label: t("field.idleScreenMusicSelectionMode.auto") },
          ]}
        />
      </Input.Wrapper>

      {homeAssistantActive && (
        <>
          <Select
            {...form.getInputProps("idleScreenHomeAssistantIntegrationId")}
            label={t("field.idleScreenHomeAssistantIntegrationId.label")}
            description={t("field.idleScreenHomeAssistantIntegrationId.description")}
            data={homeAssistantIntegrations.map((integration) => ({
              value: integration.id,
              label: integration.name,
            }))}
            clearable
            searchable
          />
          {homeAssistantIntegrations.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("field.idleScreenHomeAssistantIntegrationId.none")}
            </Text>
          )}
          <Select
            {...form.getInputProps("idleScreenMediaPlayerEntityId")}
            label={t("field.idleScreenMediaPlayerEntityId.label")}
            description={t("field.idleScreenMediaPlayerEntityId.description")}
            data={mediaPlayers.map((entity) => ({
              value: entity.id,
              label: entity.name,
            }))}
            clearable
            searchable
            disabled={!homeAssistantIntegrationId}
          />
        </>
      )}

      {musicAssistantActive && (
        <>
          <Select
            {...form.getInputProps("idleScreenMusicAssistantIntegrationId")}
            label={t("field.idleScreenMusicAssistantIntegrationId.label")}
            description={t("field.idleScreenMusicAssistantIntegrationId.description")}
            data={musicAssistantIntegrations.map((integration) => ({
              value: integration.id,
              label: integration.name,
            }))}
            clearable
            searchable
          />
          {musicAssistantIntegrations.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("field.idleScreenMusicAssistantIntegrationId.none")}
            </Text>
          )}
          <Select
            {...form.getInputProps("idleScreenMusicAssistantQueueId")}
            label={t("field.idleScreenMusicAssistantQueueId.label")}
            description={t("field.idleScreenMusicAssistantQueueId.description")}
            data={musicAssistantQueues.map((queue) => ({
              value: queue.id,
              label: queue.name,
            }))}
            clearable
            searchable
            disabled={!musicAssistantIntegrationId}
          />
        </>
      )}

      {selectionMode === "auto" && (
        <>
          <Input.Wrapper
            labelElement="div"
            label={t("field.idleScreenMusicPlayerFilterMode.label")}
            description={t("field.idleScreenMusicPlayerFilterMode.description")}
          >
            <SegmentedControl<"include" | "exclude">
              mt="xs"
              fullWidth
              value={form.values.idleScreenMusicPlayerFilterMode}
              onChange={(value) => form.setFieldValue("idleScreenMusicPlayerFilterMode", value)}
              data={[
                { value: "include", label: t("field.idleScreenMusicPlayerFilterMode.include") },
                { value: "exclude", label: t("field.idleScreenMusicPlayerFilterMode.exclude") },
              ]}
            />
          </Input.Wrapper>

          <Input.Wrapper
            labelElement="div"
            label={t("field.idleScreenMusicPlayerIds.label")}
            description={t("field.idleScreenMusicPlayerIds.description")}
          >
            {players.length === 0 ? (
              <Text size="sm" c="dimmed" mt="xs">
                {t("field.idleScreenMusicPlayerIds.none")}
              </Text>
            ) : (
              <Checkbox.Group mt="xs" {...form.getInputProps("idleScreenMusicPlayerIds")}>
                <ScrollArea.Autosize mah={224} type="auto" scrollbars="y">
                  <Stack gap={6} pr="xs">
                    {players.map((player) => (
                      <Checkbox key={player.value} value={player.value} label={player.label} />
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              </Checkbox.Group>
            )}
          </Input.Wrapper>
        </>
      )}
    </Stack>
  );
};
