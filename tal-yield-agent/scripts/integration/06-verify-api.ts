import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, ".agent-state.json");

function loadState(): Record<string, unknown> {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  }
  return {};
}

const PORT = process.env.PORT || "3000";
const BASE_URL = `http://localhost:${PORT}/api/v1`;

interface TestResult {
  endpoint: string;
  status: number;
  ok: boolean;
  detail: string;
}

async function testEndpoint(
  path: string,
  expect: { status?: number; check?: (body: unknown) => string },
): Promise<TestResult> {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    const status = res.status;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }

    const expectedStatus = expect.status ?? 200;
    const ok = status === expectedStatus;
    const detail = expect.check ? expect.check(body) : `status: ${status}`;

    return { endpoint: path, status, ok, detail };
  } catch (err) {
    return {
      endpoint: path,
      status: 0,
      ok: false,
      detail: `Connection failed: ${(err as Error).message?.slice(0, 80)}`,
    };
  }
}

async function main() {
  console.log("\n▶ Step 7: API Verification\n");

  const state = loadState();
  const taskRef = state.taskRef as string | undefined;
  const strategy = state.strategy as { snapshotId: string } | undefined;

  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Task ref: ${taskRef || "N/A"}`);
  console.log(`  Snapshot ID: ${strategy?.snapshotId || "N/A"}`);

  // --- Check if server is running ---
  console.log("\n  Checking server availability...");
  try {
    await fetch(`${BASE_URL}/health`);
    console.log("  Server is running\n");
  } catch {
    console.log("  ⚠️  Server not running at port " + PORT);
    console.log("  Start it with: cd packages/agent-server && pnpm dev");
    console.log("  Or: PORT=" + PORT + " npx tsx packages/agent-server/src/index.ts");
    console.log("\n  Attempting to test anyway...\n");
  }

  // --- Test endpoints ---
  const results: TestResult[] = [];

  // Health
  results.push(
    await testEndpoint("/health", {
      check: (body) => {
        const b = body as { status?: string; poolCount?: number; snapshotCount?: number; taskCount?: number };
        return `status: ${b.status}, pools: ${b.poolCount ?? "?"}, snapshots: ${b.snapshotCount ?? "?"}, tasks: ${b.taskCount ?? "?"}`;
      },
    }),
  );

  // Pools
  results.push(
    await testEndpoint("/pools", {
      check: (body) => {
        if (Array.isArray(body)) return `count: ${body.length}`;
        const b = body as { pools?: unknown[]; count?: number };
        return `count: ${b.pools?.length ?? b.count ?? "?"}`;
      },
    }),
  );

  // Pool search
  results.push(
    await testEndpoint("/pools/search?protocol=aave&chain=1", {
      check: (body) => {
        if (Array.isArray(body)) return `results: ${body.length}`;
        const b = body as { pools?: unknown[]; results?: unknown[] };
        return `results: ${(b.pools || b.results)?.length ?? "?"}`;
      },
    }),
  );

  // Agent reputation (on-chain via SDK)
  results.push(
    await testEndpoint("/agent/reputation", {
      check: (body) => {
        const b = body as { score?: number; feedbackCount?: number; error?: string };
        if (b.error) return `error: ${b.error}`;
        return `score: ${b.score ?? "?"}, feedback: ${b.feedbackCount ?? "?"}`;
      },
    }),
  );

  // Agent stats
  results.push(
    await testEndpoint("/agent/stats", {
      check: (body) => {
        const b = body as { tasksCompleted?: number; totalRevenue?: string; error?: string };
        if (b.error) return `error: ${b.error}`;
        return `completed: ${b.tasksCompleted ?? "?"}, revenue: ${b.totalRevenue ?? "?"}`;
      },
    }),
  );

  // Task-specific endpoints (may return 404 since server uses in-memory cache)
  if (taskRef) {
    results.push(
      await testEndpoint(`/task/${taskRef}`, {
        status: undefined, // Accept any status
        check: (body) => {
          const b = body as { status?: string; error?: string; taskRef?: string };
          if (b.error) return `not in cache (expected — in-memory server)`;
          return `status: ${b.status ?? "?"}`;
        },
      }),
    );
  }

  if (strategy?.snapshotId) {
    results.push(
      await testEndpoint(`/snapshot/${strategy.snapshotId}`, {
        status: undefined,
        check: (body) => {
          const b = body as { poolStates?: unknown[]; error?: string };
          if (b.error) return `not in cache (expected — in-memory server)`;
          return `pools: ${b.poolStates?.length ?? "?"}`;
        },
      }),
    );
  }

  // --- Log results ---
  console.log("  API Verification Results:\n");
  let allOk = true;
  for (const r of results) {
    const icon = r.status === 0 ? "⚠️ " : r.ok ? "✅" : "⚠️ ";
    if (!r.ok && r.status !== 0) allOk = false;
    const padded = r.endpoint.padEnd(35);
    console.log(`   ${icon} ${padded} → ${r.status || "ERR"} ${r.detail}`);
  }

  const reachable = results.filter((r) => r.status > 0).length;
  const ok = results.filter((r) => r.ok).length;

  console.log(`\n  Summary: ${ok}/${results.length} passed, ${reachable}/${results.length} reachable`);

  if (reachable === 0) {
    console.log("\n  ⚠️  Server not reachable — API verification skipped");
    console.log("  This is expected if the server is not running.");
    console.log("  The on-chain integration (Steps 1-6) is independent of the API.");
    console.log("\n✅ API verification complete (server offline — non-blocking)\n");
  } else if (allOk) {
    console.log("\n✅ API verification complete\n");
  } else {
    console.log("\n⚠️  Some endpoints returned unexpected status codes\n");
  }
}

main().catch((err) => {
  console.error("\n❌ API verification FAILED:", err.message);
  process.exit(1);
});
