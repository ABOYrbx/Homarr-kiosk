"use client";

import { startTransition } from "react";
import { ActionIcon, Autocomplete, Center, Group, Popover, Switch } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconPhotoOff, IconUpload, IconX } from "@tabler/icons-react";

import { clientApi } from "@homarr/api/client";
import { useSession } from "@homarr/auth/client";
import type { UseFormReturnType } from "@homarr/form";
import { UploadMedia } from "@homarr/forms-collection";
import { createLocalMediaUrl } from "@homarr/icons/local-media-url";
import { useI18n } from "@homarr/translation/client";
import { supportedMediaUploadFormats } from "@homarr/validation/media";

import type { FormValues } from "./_settings-form";

interface Props {
  form: UseFormReturnType<FormValues>;
}

export const IdleWidgetBackgroundSettings = ({ form }: Props) => {
  const t = useI18n("board");
  const { data: session } = useSession();
  const background = form.values.idleScreenWidgetBackground ?? "";
  const [debouncedSearch] = useDebouncedValue(background, 200);
  const medias = clientApi.media.getPaginated.useQuery({
    page: 1,
    pageSize: 10,
    includeFromAllUsers: true,
    search: debouncedSearch,
  });
  const images = medias.data?.items.filter((media) => media.contentType.startsWith("image/")) ?? [];

  return (
    <Group wrap="nowrap" gap="xs" align="flex-end">
      <Autocomplete
        flex={1}
        leftSection={
          background.trim().length >= 2 && (
            <Popover width={300} withArrow>
              <Popover.Target>
                <Center h="100%">
                  <ImagePreview src={background} w={20} h={20} />
                </Center>
              </Popover.Target>
              <Popover.Dropdown>
                <ImagePreview src={background} w="100%" />
              </Popover.Dropdown>
            </Popover>
          )
        }
        rightSection={
          background ? (
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={t("field.idleScreenWidgetBackground.clear")}
              onClick={() => form.setFieldValue("idleScreenWidgetBackground", null)}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : undefined
        }
        rightSectionWidth={36}
        filter={({ options }) => options}
        label={t("field.idleScreenWidgetBackground.label")}
        description={t("field.idleScreenWidgetBackground.description")}
        placeholder={t("field.idleScreenWidgetBackground.placeholder")}
        data={[
          {
            group: t("field.idleScreenWidgetBackground.group.your"),
            items: images
              .filter((media) => media.creatorId === session?.user.id)
              .map((media) => createLocalMediaUrl(media.id)),
          },
          {
            group: t("field.idleScreenWidgetBackground.group.other"),
            items: images
              .filter((media) => media.creatorId !== session?.user.id)
              .map((media) => createLocalMediaUrl(media.id)),
          },
        ]}
        value={background}
        onChange={(value) => form.setFieldValue("idleScreenWidgetBackground", value.trim() ? value : null)}
      />
      {session?.user.permissions.includes("media-upload") && (
        <UploadMedia
          accept={supportedMediaUploadFormats}
          onSuccess={(uploadedMedias) => {
            const first = uploadedMedias.at(0);
            if (!first) return;
            startTransition(() => form.setFieldValue("idleScreenWidgetBackground", first.url));
          }}
        >
          {({ onClick, loading }) => (
            <ActionIcon onClick={onClick} loading={loading} size={36} variant="default">
              <IconUpload size={16} stroke={1.5} />
            </ActionIcon>
          )}
        </UploadMedia>
      )}
    </Group>
  );
};

export const IdleWidgetBackgroundFrost = ({ form }: Props) => {
  const t = useI18n("board");
  return (
    <Switch
      label={t("field.idleScreenWidgetBackgroundFrost.label")}
      description={t("field.idleScreenWidgetBackgroundFrost.description")}
      checked={form.values.idleScreenWidgetBackgroundFrost ?? true}
      onChange={(event) => form.setFieldValue("idleScreenWidgetBackgroundFrost", event.currentTarget.checked)}
    />
  );
};

const ImagePreview = ({ src, w, h }: { src: string; w: string | number; h?: string | number }) => {
  if (!["/", "http://", "https://"].some((prefix) => src.startsWith(prefix))) return <IconPhotoOff size={w} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Idle background preview" style={{ width: w, height: h, objectFit: "contain" }} />;
};
