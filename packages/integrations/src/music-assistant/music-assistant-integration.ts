import { env } from "@homarr/common/env";
import { createKeyedFingerprint, decryptSecret } from "@homarr/common/server";
import { db, eq } from "@homarr/db";
import { integrations, integrationSecrets } from "@homarr/db/schema";

import type { IntegrationTestingInput } from "../base/integration";
import { Integration } from "../base/integration";
import type { TestingResult } from "../base/test-connection/test-connection-service";
import type { IntegrationHttpAuthentication } from "../http-auth";
import { MusicAssistantConnection } from "./music-assistant-connection";
import type { QueueInfo, QueueView } from "./music-assistant-queue";
import { normalizeQueue, normalizeQueues } from "./music-assistant-queue";

export class MusicAssistantIntegration extends Integration {
  public async getHttpAuthenticationAsync(): Promise<IntegrationHttpAuthentication> {
    // MA speaks a token-authenticated WebSocket protocol, not standard HTTP auth.
    return { headers: {} };
  }

  public async getQueuesAsync(): Promise<QueueInfo[]> {
    if (env.NO_EXTERNAL_CONNECTION) return [];
    const queues = await this.getConnection().sendAsync("player_queues/all");
    return normalizeQueues(queues);
  }

  public async getQueueAsync(queueId: string): Promise<QueueView> {
    if (env.NO_EXTERNAL_CONNECTION) return { tracks: [], currentIndex: undefined };
    const connection = this.getConnection();
    // Current MA servers return a queue state from `get` and the tracks from
    // `items`; the normaliser also accepts queues that embed their tracks.
    const [queue, items] = await Promise.all([
      connection.sendAsync("player_queues/get", { queue_id: queueId }),
      connection.sendAsync("player_queues/items", { queue_id: queueId, limit: 500 }),
    ]);
    return normalizeQueue(queue, items);
  }

  protected async testingAsync(input: IntegrationTestingInput): Promise<TestingResult> {
    await MusicAssistantConnection.testAsync(this.webSocketUrl("/ws"), this.getSecretValue("apiKey"), input.options);
    return { success: true };
  }

  private getConnection() {
    const url = this.webSocketUrl("/ws");
    const token = this.getSecretValue("apiKey");
    return MusicAssistantConnection.acquire({
      key: `${this.integration.id}:${createKeyedFingerprint(`${url.toString()}\n${token}`)}`,
      integrationId: this.integration.id,
      url,
      token,
      isConfigurationCurrentAsync: async () => await this.isConfigurationCurrentAsync(),
    });
  }

  private async isConfigurationCurrentAsync() {
    const current = await db.query.integrations.findFirst({
      where: eq(integrations.id, this.integration.id),
      columns: { url: true, kind: true },
      with: {
        secrets: {
          where: eq(integrationSecrets.kind, "apiKey"),
          columns: { value: true },
        },
      },
    });
    if (!current || current.kind !== "musicAssistant" || current.url !== this.integration.url) return false;
    const token = current.secrets[0]?.value;
    return token !== undefined && decryptSecret(token) === this.getSecretValue("apiKey");
  }
}
