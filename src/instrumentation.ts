export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configurationProblems, isProduction, scanExecution, billingMode } =
    await import("./lib/env");
  const { logger } = await import("./lib/logger");

  const problems = configurationProblems();
  if (problems.length > 0) {
    if (isProduction()) {
      // Fail closed: refusing to start is safer than serving with broken
      // session signing, reset links, or database configuration.
      logger.error("config.invalid", { problems });
      throw new Error(`Invalid runtime configuration: ${problems.join("; ")}`);
    }
    logger.warn("config.incomplete", { problems });
  }

  logger.info("app.started", {
    environment: process.env.NODE_ENV,
    billingMode: billingMode(),
    scanExecution: scanExecution(),
  });
}
