import { z } from "zod";
import type { IDataSource } from "../types.js";
import {
  MOCK_DEFILLAMA_YIELDS_RESPONSE,
  MOCK_DEFILLAMA_CHART_RESPONSE,
} from "./mock-data.js";

/**
 * Mock data source for testing.
 * Returns static data based on URL patterns.
 */
export class MockDataSource implements IDataSource {
  private responses: Map<string, unknown> = new Map();
  fetchCallCount = 0;

  constructor() {
    // Pre-populate with default mock data
    this.responses.set("https://yields.llama.fi/pools", MOCK_DEFILLAMA_YIELDS_RESPONSE);
  }

  /**
   * Register a custom response for a URL pattern.
   */
  setResponse(urlPattern: string, data: unknown): void {
    this.responses.set(urlPattern, data);
  }

  async fetch<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    this.fetchCallCount++;
    const raw = await this.fetchRaw(url);
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Mock validation failed for ${url}: ${result.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    return result.data;
  }

  async fetchRaw(url: string): Promise<unknown> {
    // Check exact match first
    const exact = this.responses.get(url);
    if (exact !== undefined) {
      return exact;
    }

    // Check if URL starts with any registered pattern
    for (const [pattern, data] of this.responses) {
      if (url.startsWith(pattern)) {
        return data;
      }
    }

    // Default: return chart response for chart URLs
    if (url.includes("/chart/")) {
      return MOCK_DEFILLAMA_CHART_RESPONSE;
    }

    throw new Error(`No mock data registered for URL: ${url}`);
  }
}
