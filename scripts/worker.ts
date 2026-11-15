import os from "node:os";

const workerId = `${os.hostname()}:${process.pid}`;
let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());

  const { validateRuntimeEnv, scanExecution } = await import("../src/lib/env");
  const { logger } = await import("../src/lib/logger");
  const { runScan } = await import("../src/lib/scan-service");
  const {
    cleanupRateLimits,
  } = await import("../src/lib/rate-limit");
  const {
    nextQueuedScan,
    queueStats,
    recordWorkerHeartbeat,
    recoverStaleScans,
  } = await import("../src/lib/scan-queue");

  try {
    validateRuntimeEnv();
  } catch (error) {
    logger.error("worker.config_invalid", { error });
    process.exit(1);
  }
  if (scanExecution() !== "worker") {
    logger.warn("worker.execution_mode_not_worker", {
      hint: "Set SCAN_EXECUTION=worker so the app enqueues instead of scanning inline.",
    });
  }

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("worker.shutdown_requested", { signal, workerId });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("worker.started", { workerId, pid: process.pid });
  await recordWorkerHeartbeat(workerId, { pid: process.pid });

  const heartbeat = setInterval(() => {
    recordWorkerHeartbeat(workerId, { pid: process.pid }).catch((error) => {
      logger.error("worker.heartbeat_failed", { error });
    });
  }, 10_000);

  let lastMaintenance = 0;
  let idleDelay = 1_000;

  while (!stopping) {
    try {
      if (Date.now() - lastMaintenance > 60_000) {
        const recovered = await recoverStaleScans();
        if (recovered > 0) {
          logger.warn("worker.stale_scans_recovered", { count: recovered });
        }
        await cleanupRateLimits();
        lastMaintenance = Date.now();
      }

      const candidate = await nextQueuedScan();
      if (!candidate) {
        await sleep(idleDelay);
        idleDelay = Math.min(5_000, idleDelay + 250);
        continue;
      }
      idleDelay = 1_000;

      logger.info("worker.scan_claimed", { scanId: candidate.id, workerId });
      try {
        const ran = await runScan(candidate.id, workerId);
        const stats = await queueStats();
        logger.info("worker.scan_finished", {
          scanId: candidate.id,
          workerId,
          ran,
          ...stats,
        });
      } catch (error) {
        logger.error("worker.scan_failed", {
          scanId: candidate.id,
          workerId,
          error,
        });
      }
    } catch (error) {
      logger.error("worker.loop_error", { error });
      await sleep(10_000);
    }
  }

  clearInterval(heartbeat);
  logger.info("worker.stopped", { workerId });
  process.exit(0);
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "worker.fatal",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
