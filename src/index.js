import express from "express";
import * as oci from "oci-sdk";
import config from "./config.js";
import logger from "./logger.js";
import {
  sendNotification,
  getExistingVM,
  createVM,
  upgradeVM,
} from "./oci-service.js";

// --- Helpers ---
function nextDelayMs(base, jitterRange) {
  const jitter = Math.floor(Math.random() * jitterRange * 2 - jitterRange);
  return Math.max(60_000, base + jitter); // never less than 1 minute
}

function isCapacityError(err) {
  const msg = (err?.message || "").toLowerCase();
  // Checks for common capacity errors (including the opaque 500 status)
  return (
    msg.includes("out of host capacity") ||
    msg.includes("out of capacity") ||
    err?.statusCode === 500
  );
}

let attempts = 0;
let timer = null;

// -----------------------------
// Main loop
// -----------------------------
async function runCheck() {
  attempts += 1;
  logger.info(`--- 🔍 OCI VM Check (attempt #${attempts}) ---`);
  try {
    const existing = await getExistingVM();
    if (existing) {
      logger.info(
        `✅ VM already exists (ID: ${existing.id}, State: ${existing.lifecycleState}).`
      );

      const oc = existing.shapeConfig?.ocpus;
      const mem = existing.shapeConfig?.memoryInGBs;

      // Auto-upgrade check for existing VMs
      if (
        oc !== config.vm.finalShapeConfig.ocpus ||
        mem !== config.vm.finalShapeConfig.memoryInGBs
      ) {
        if (
          existing.lifecycleState ===
          oci.core.models.Instance.LifecycleState.Running
        ) {
          logger.warn(
            `⚠️ VM shape (${oc} OCPUs) differs from final goal (${config.vm.finalShapeConfig.ocpus}). Initiating upgrade...`
          );
          await upgradeVM(existing.id);
        } else {
          logger.info(
            `ℹ️ VM not RUNNING (${existing.lifecycleState}). Cannot check/upgrade shape.`
          );
        }
      }
      scheduleNext();
      return;
    }

    // Attempt Creation and immediate Upgrade
    const created = await createVM();
    if (created) {
      // This is the critical second step to get the full 4 OCPUs
      await upgradeVM(created.id);
    }
  } catch (err) {
    if (isCapacityError(err)) {
      // Handle the common capacity failure without sending an email
      logger.warn(
        `⚠️ Out of host capacity on attempt #${attempts}. Will retry with delay.`
      );
    } else {
      // Handle unexpected errors (e.g., Auth, Rate Limit, VCN misconfig) with an alert
      logger.error("❌ Unexpected error.", err);
      await sendNotification(
        "❌ OCI VM Job FAILED",
        `Unexpected error:\n${err?.message || err}\n\n${err?.stack || ""}`
      );
    }
  } finally {
    scheduleNext();
  }
}

function scheduleNext() {
  const delay = nextDelayMs(config.baseRetryIntervalMs, config.jitterRangeMs);
  logger.info(`⏳ Next check in ${(delay / 60000).toFixed(1)} minutes...`);
  timer = setTimeout(runCheck, delay);
}

// -----------------------------
// Express / Startup
// -----------------------------
const app = express();
app.get("/health", (_req, res) =>
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
);

app.listen(config.port, () => {
  logger.info(`🚀 OCI VM Creator running on port ${config.port}`);
  logger.info(`🩺 Health: http://localhost:${config.port}/health`);
  logger.info(
    `🔁 Retry cadence: every ${(config.baseRetryIntervalMs / 1000).toFixed(
      0
    )}s ± ${(config.jitterRangeMs / 1000).toFixed(0)}s, no backoff.`
  );

  // Optional random startup delay (desync at boot)
  const startDelay =
    config.startupJitterMs > 0
      ? Math.floor(Math.random() * config.startupJitterMs)
      : 0;
  if (startDelay > 0) {
    logger.info(`⏲️ Random startup delay: ${(startDelay / 1000).toFixed(0)}s`);
    setTimeout(runCheck, startDelay);
  } else {
    runCheck();
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  if (timer) clearTimeout(timer);
  logger.info("👋 Exiting...");
  process.exit();
});
