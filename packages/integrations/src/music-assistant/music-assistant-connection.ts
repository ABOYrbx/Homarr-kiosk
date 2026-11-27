import type { RawData } from "ws";
import { WebSocket } from "ws";

import { isRecord } from "@homarr/common";
import { matchErrorCode, RequestError, ResponseError } from "@homarr/common/server";
import {
  getAllTrustedCertificatesAsync,
  getTrustedCertificateHostnamesAsync,
} from "@homarr/core/infrastructure/certificates";
import { createCustomCheckServerIdentity } from "@homarr/core/infrastructure/http";
import { createLogger } from "@homarr/core/infrastructure/logs";
import { getIntegrationCacheGenerationAsync } from "@homarr/redis";

import type { IntegrationTestingInput } from "../base/integration";

const logger = createLogger({ module: "musicAssistantConnection" });

const COMMAND_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;
const CONFIGURATION_CHECK_MS = 5_000;
const DEVICE_NAME = "Homarr";

type CertificateOptions = IntegrationTestingInput["options"];

export interface MusicAssistantConnectionOptions {
  key: string;
  integrationId: string;
  url: URL;
  token: string;
  deviceName?: string;
  isConfigurationCurrentAsync: () => Promise<boolean>;
}

export class MusicAssistantCommandError extends Error {
  public constructor(public readonly code: number) {
    super(`Music Assistant command failed (code ${code})`);
    this.name = "MusicAssistantCommandError";
  }
}

export class MusicAssistantConfigurationChangedError extends Error {
  public constructor() {
    super("Music Assistant integration configuration changed; reconnect with the current configuration");
    this.name = "MusicAssistantConfigurationChangedError";
  }
}

const connectionClosedError = () =>
  new RequestError(
    { type: "connection", reason: "reset", code: "ECONNRESET" },
    { cause: new Error("Music Assistant connection closed") },
  );

const timeoutError = (command: string) =>
  new RequestError(
    { type: "timeout", reason: "aborted", code: "ECONNABORTED" },
    { cause: new Error(`Music Assistant command ${command} timed out`) },
  );

const describeFailure = (error: unknown) => {
  if (error instanceof MusicAssistantCommandError) return `command:${error.code}`;
  if (error instanceof MusicAssistantConfigurationChangedError) return "configuration";
  if (error instanceof RequestError || error instanceof ResponseError) return "network";
  return "unknown";
};

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

let messageSequence = 0;
const createMessageId = () => `homarr-${++messageSequence}`;

export class MusicAssistantConnection {
  private static readonly pool = new Map<string, MusicAssistantConnection>();

  public static acquire(options: MusicAssistantConnectionOptions) {
    const existing = MusicAssistantConnection.pool.get(options.key);
    if (existing) return existing;

    const connection = new MusicAssistantConnection(options);
    MusicAssistantConnection.pool.set(options.key, connection);
    return connection;
  }

  public static async testAsync(url: URL, token: string, certificate: CertificateOptions) {
    const socket = await openSocketAsync(url, certificate);
    try {
      await authenticateAsync(socket, token, DEVICE_NAME);
    } finally {
      socket.close();
    }
  }

  private socket: Promise<WebSocket> | undefined;
  private readonly pending = new Map<string, PendingCommand>();
  private idleTimer: NodeJS.Timeout | undefined;
  private configurationTimer: NodeJS.Timeout | undefined;
  private configurationGeneration: string | undefined;
  private configurationCheck: Promise<void> | undefined;
  private closed = false;

  private constructor(private readonly options: MusicAssistantConnectionOptions) {}

  public async sendAsync<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    this.touch();
    const socket = await this.getSocketAsync();
    if (this.closed) throw connectionClosedError();
    return (await this.sendOnSocketAsync(socket, command, args)) as T;
  }

  private sendOnSocketAsync(socket: WebSocket, command: string, args: Record<string, unknown>) {
    const messageId = createMessageId();
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(messageId);
        reject(timeoutError(command));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(messageId, { resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ message_id: messageId, command, args }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(messageId);
        reject(error);
      }
    });
  }

  private async getSocketAsync() {
    if (this.closed) return Promise.reject(connectionClosedError());
    if (this.socket) return this.socket;

    const socket = this.connectAsync();
    this.socket = socket;
    socket.then(
      (webSocket) => {
        webSocket.on("message", (raw) => this.handleMessage(raw));
        webSocket.once("close", () => this.handleClose(socket));
        webSocket.on("error", () => logger.debug("Music Assistant socket error", { key: this.options.key }));
      },
      () => {
        if (this.socket === socket) this.socket = undefined;
      },
    );
    return socket;
  }

  private async connectAsync() {
    await this.validateConfigurationAsync(true);
    for (const connection of MusicAssistantConnection.pool.values()) {
      if (connection === this || connection.options.integrationId !== this.options.integrationId) continue;
      connection.close(new MusicAssistantConfigurationChangedError());
    }

    const socket = await openSocketAsync(new URL(this.options.url), await resolveCertificateOptionsAsync());
    try {
      await authenticateAsync(socket, this.options.token, this.options.deviceName ?? DEVICE_NAME);
      if (this.closed) throw connectionClosedError();
    } catch (error) {
      socket.close();
      throw error;
    }
    logger.debug("Connected to Music Assistant websocket", { key: this.options.key });
    this.scheduleConfigurationCheck();
    return socket;
  }

  private async validateConfigurationAsync(force = false) {
    if (this.closed) throw connectionClosedError();
    if (this.configurationCheck) return await this.configurationCheck;
    const check = this.checkConfigurationAsync(force);
    this.configurationCheck = check;
    try {
      await check;
    } finally {
      if (this.configurationCheck === check) this.configurationCheck = undefined;
    }
  }

  private async checkConfigurationAsync(force: boolean) {
    const generation = await getIntegrationCacheGenerationAsync(this.options.integrationId);
    if (force || !generation.isShared || this.configurationGeneration !== generation.value) {
      if (!(await this.options.isConfigurationCurrentAsync())) {
        const error = new MusicAssistantConfigurationChangedError();
        this.close(error);
        throw error;
      }
      this.configurationGeneration = generation.value;
    }
    if (this.closed) throw connectionClosedError();
  }

  private scheduleConfigurationCheck() {
    clearTimeout(this.configurationTimer);
    if (this.closed || !this.socket) return;
    this.configurationTimer = setTimeout(() => {
      this.configurationTimer = undefined;
      void this.validateConfigurationAsync().then(
        () => this.scheduleConfigurationCheck(),
        (error: unknown) => {
          logger.warn("Music Assistant configuration check failed, closing the connection", {
            key: this.options.key,
            reason: describeFailure(error),
          });
          this.close(error);
        },
      );
    }, CONFIGURATION_CHECK_MS);
    this.configurationTimer.unref();
  }

  private handleMessage(raw: RawData) {
    const message = parseJson(raw);
    if (!isRecord(message) || typeof message.message_id !== "string") return;
    const pending = this.pending.get(message.message_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(message.message_id);
    if ("error_code" in message) {
      // MA error details and data can echo request metadata: log only the code.
      pending.reject(new MusicAssistantCommandError(typeof message.error_code === "number" ? message.error_code : -1));
      return;
    }
    pending.resolve("result" in message ? message.result : undefined);
  }

  private handleClose(socket: Promise<WebSocket>) {
    if (this.socket !== socket) return;
    this.clearConnection(connectionClosedError());
  }

  private clearConnection(error: unknown) {
    clearTimeout(this.configurationTimer);
    this.socket = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    logger.debug("Music Assistant websocket closed", { key: this.options.key, reason: describeFailure(error) });
  }

  private touch() {
    if (this.closed) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), IDLE_TIMEOUT_MS);
    this.idleTimer.unref();
  }

  private close(error: unknown = connectionClosedError()) {
    this.closed = true;
    clearTimeout(this.idleTimer);
    const socket = this.socket;
    this.clearConnection(error);
    if (MusicAssistantConnection.pool.get(this.options.key) === this) {
      MusicAssistantConnection.pool.delete(this.options.key);
    }
    void socket?.then((webSocket) => webSocket.close()).catch(() => undefined);
  }
}

const authenticateAsync = async (socket: WebSocket, token: string, deviceName: string) =>
  await new Promise<void>((resolve, reject) => {
    const messageId = createMessageId();
    const timeout = setTimeout(() => {
      cleanup();
      reject(timeoutError("auth"));
    }, CONNECT_TIMEOUT_MS);

    const onMessage = (raw: RawData) => {
      const message = parseJson(raw);
      if (!isRecord(message) || message.message_id !== messageId) return;
      if ("error_code" in message) {
        cleanup();
        reject(new MusicAssistantCommandError(typeof message.error_code === "number" ? message.error_code : -1));
        return;
      }
      if ("result" in message) {
        cleanup();
        resolve();
      }
    };
    const onClose = () => {
      cleanup();
      reject(connectionClosedError());
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    };

    socket.on("message", onMessage);
    socket.once("close", onClose);
    try {
      socket.send(JSON.stringify({ message_id: messageId, command: "auth", args: { token, device_name: deviceName } }));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });

const resolveCertificateOptionsAsync = async (): Promise<CertificateOptions> => ({
  ca: await getAllTrustedCertificatesAsync(),
  checkServerIdentity: createCustomCheckServerIdentity(await getTrustedCertificateHostnamesAsync()),
});

const openSocketAsync = async (url: URL, certificate: CertificateOptions) =>
  await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, {
      ca: certificate.ca,
      checkServerIdentity: certificate.checkServerIdentity as never,
      handshakeTimeout: CONNECT_TIMEOUT_MS,
    });
    socket.once("open", () => resolve(socket));
    socket.once("unexpected-response", (_request, response) => {
      reject(new ResponseError({ status: response.statusCode ?? 500, url: url.toString() }));
    });
    socket.once("error", (error: Error & { code?: string }) => {
      const matched = error.code ? matchErrorCode(error.code) : undefined;
      reject(matched ? new RequestError(matched, { cause: error }) : error);
    });
  });

const parseJson = (raw: RawData): unknown => {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return undefined;
  }
};
