"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, NumberInput, Select, Stack, Switch, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

import { clientApi } from "@homarr/api/client";
import type { UseFormReturnType } from "@homarr/form";
import { showErrorNotification } from "@homarr/notifications";
import { useI18n } from "@homarr/translation/client";

import { SectionCard } from "@homarr/ui";
import type { Board } from "../../_types";
import type { FormValues } from "./_settings-form";

interface Props {
  form: UseFormReturnType<FormValues>;
}

interface IdleScreenProps extends Props {
  board: Board;
  saveSettingsAsync: () => Promise<unknown>;
}

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
          <Select
            {...form.getInputProps("idleScreenMode")}
            label={t("field.idleScreenMode.label")}
            description={t("field.idleScreenMode.description")}
            data={[
              { value: "auto", label: t("field.idleScreenMode.option.auto") },
              { value: "clock", label: t("field.idleScreenMode.option.clock") },
              { value: "music", label: t("field.idleScreenMode.option.music") },
              { value: "widgets", label: t("field.idleScreenMode.option.widgets") },
            ]}
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
        </Stack>
      )}
    </SectionCard>
  );
};
