import { z } from "zod";
import type { IDataSource } from "../types.js";
import { createChildLogger } from "../logger.js";

const log = createChildLogger("data-source");

/**
 * HTTP data source that fetches and validates responses with Zod schemas.
 * Injectable for testing — swap with a mock that returns static data.
 */
export class HttpDataSource implements IDataSource {
  private readonly baseHeaders: Record<string, string>;

  constructor(headers?: Record<string, string>) {
    this.baseHeaders = {
      Accept: "application/json",
      ...headers,
    };
  }

  async fetch<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    const raw = await this.fetchRaw(url);
    const result = schema.safeParse(raw);
    if (!result.success) {
      log.error({ url, errors: result.error.issues }, "Zod validation failed");
      throw new Error(
        `Validation failed for ${url}: ${result.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    return result.data;
  }

  async fetchRaw(url: string): Promise<unknown> {
    log.debug({ url }, "Fetching data");
    const response = await globalThis.fetch(url, {
      headers: this.baseHeaders,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return response.json() as Promise<unknown>;
  }
}
