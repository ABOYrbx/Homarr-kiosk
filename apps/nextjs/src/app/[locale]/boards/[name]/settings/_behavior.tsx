"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, Input, NumberInput, Select, Slider, Stack, Switch, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

import { clientApi } from "@homarr/api/client";
import type { UseFormReturnType } from "@homarr/form";
import { showErrorNotification } from "@homarr/notifications";
import { useI18n } from "@homarr/translation/client";

import { SectionCard } from "@homarr/ui";
import type { Board } from "../../_types";
import { IdlePreviewSettings } from "./_idle-preview-settings";
import type { FormValues } from "./_settings-form";

interface Props {
  form: UseFormReturnType<FormValues>;
}

interface IdleScreenProps extends Props {
  board: Board;
  saveSettingsAsync: () => Promise<unknown>;
}

const formatLyricsOffset = (seconds: number) => `${seconds > 0 ? "+" : ""}${seconds} s`;
const lyricsOffsetFieldId = "idle-screen-lyrics-offset";
const lyricsOffsetInputContainer = (children: ReactNode) => (
  <fieldset
    aria-labelledby={`${lyricsOffsetFieldId}-label`}
    aria-describedby={`${lyricsOffsetFieldId}-description`}
    style={{ border: 0, margin: 0, padding: 0 }}
  >
    {children}
  </fieldset>
);

export const BehaviorSettingsContent = ({ form }: Props) => {
  const t = useI18n("board");

  return (
    <SectionCard title={t("setting.section.behavior.title")}>
      <Switch
        label={t("field.disableStatus.label")}
        description={t("field.disableStatus.description")}
        {...form.getInputProps("disableStatus", { type: "checkbox" })}
      />
    </SectionCard>
  );
};

export const IdleScreenSettingsContent = ({ board, form, saveSettingsAsync }: IdleScreenProps) => {
  const t = useI18n("board");
  const tCommon = useI18n("common");
  const router = useRouter();

  const { mutateAsync: createIdleScreenLayout, isPending: isCreatingLayout } =
    clientApi.board.createIdleScreenLayout.useMutation({
      onError() {
        showErrorNotification({
          title: tCommon("notification.update.error"),
          message: tCommon("notification.update.error"),
        });
      },
    });

  const { data: integrations = [] } = clientApi.integration.all.useQuery(undefined, {
    staleTime: 60_000,
  });

  const homeAssistantIntegrations = useMemo(
    () => integrations.filter((integration) => integration.kind === "homeAssistant"),
    [integrations],
  );

  const integrationId = form.values.idleScreenHomeAssistantIntegrationId;
  const { data: catalog } = clientApi.widget.smartHome.searchCatalog.useQuery(
    { integrationId: integrationId ?? "", domains: ["media_player"], query: "", limit: 100 },
    { enabled: Boolean(integrationId), staleTime: 60_000 },
  );

  const mediaPlayers = useMemo(() => catalog?.entities ?? [], [catalog]);

  useEffect(() => {
    // Wait for the catalog before validating: an empty array while loading
    // would silently clear a previously saved entity.
    if (!integrationId || !catalog) return;
    const selected = form.values.idleScreenMediaPlayerEntityId;
    if (selected && !mediaPlayers.some((entity) => entity.id === selected)) {
      form.setFieldValue("idleScreenMediaPlayerEntityId", null);
    }
  }, [integrationId, catalog, mediaPlayers, form]);

  const enabled = form.values.idleScreenEnabled;
  const lyricsOffset = form.values.idleScreenLyricsOffsetSeconds ?? 0;

  const handleEditIdleScreenLayout = async () => {
    let layoutId = form.values.idleScreenLayoutId;

    if (!layoutId) {
      try {
        const { layoutId: createdLayoutId } = await createIdleScreenLayout({
          boardId: board.id,
          name: t("field.idleScreenLayout.layoutName"),
        });
        layoutId = createdLayoutId;
        form.setFieldValue("idleScreenLayoutId", layoutId);
      } catch {
        // The mutation callback displays the error notification.
        return;
      }
    }

    if (form.isDirty()) await saveSettingsAsync();
    router.push(`/boards/${board.name}?layout=${encodeURIComponent(layoutId)}&edit=true&returnTo=settings`);
  };

  return (
    <SectionCard title={t("setting.section.idleScreen.title")}>
      <Switch
        label={t("field.idleScreenEnabled.label")}
        description={t("field.idleScreenEnabled.description")}
        {...form.getInputProps("idleScreenEnabled", { type: "checkbox" })}
      />

      {enabled && (
        <Stack gap="sm">
          <NumberInput
            {...form.getInputProps("idleScreenTimeoutMinutes")}
            label={t("field.idleScreenTimeoutMinutes.label")}
            description={t("field.idleScreenTimeoutMinutes.description")}
            min={1}
            max={120}
          />
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={2} maw="52rem">
              <Text fw={500}>{t("field.idleScreenLayout.label")}</Text>
              <Text size="sm">{t("field.idleScreenLayout.description")}</Text>
            </Stack>
            <Button
              type="button"
              variant="light"
              loading={isCreatingLayout}
              leftSection={<IconPlus size={16} />}
              onClick={() => void handleEditIdleScreenLayout()}
            >
              {t("field.idleScreenLayout.edit")}
            </Button>
          </Group>
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
            disabled={!integrationId}
          />
          <Switch
            label={t("field.idleScreenShowClockSeconds.label")}
            description={t("field.idleScreenShowClockSeconds.description")}
            {...form.getInputProps("idleScreenShowClockSeconds", { type: "checkbox" })}
          />
          <Switch
            label={t("field.idleScreenShowLyrics.label")}
            description={t("field.idleScreenShowLyrics.description")}
            {...form.getInputProps("idleScreenShowLyrics", { type: "checkbox" })}
          />
          {form.values.idleScreenShowLyrics && (
            <Input.Wrapper
              id={lyricsOffsetFieldId}
              labelElement="div"
              label={t("field.idleScreenLyricsOffsetSeconds.label")}
              description={t("field.idleScreenLyricsOffsetSeconds.description")}
              inputContainer={lyricsOffsetInputContainer}
            >
              <Slider
                thumbLabel={t("field.idleScreenLyricsOffsetSeconds.label")}
                thumbValueText={formatLyricsOffset(lyricsOffset)}
                label={formatLyricsOffset}
                maw="80%"
                mx="auto"
                mt="xs"
                mb="sm"
                min={-15}
                max={15}
                step={0.5}
                marks={[
                  { value: -10, label: "-10 s" },
                  { value: -5, label: "-5 s" },
                  { value: 0, label: "0 s" },
                  { value: 5, label: "+5 s" },
                  { value: 10, label: "+10 s" },
                ]}
                value={lyricsOffset}
                onChange={(value) => form.setFieldValue("idleScreenLyricsOffsetSeconds", value)}
              />
            </Input.Wrapper>
          )}
        </Stack>
      )}

      <IdlePreviewSettings form={form} board={board} />
    </SectionCard>
  );
};
