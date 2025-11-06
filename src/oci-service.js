import * as oci from "oci-sdk";
import nodemailer from "nodemailer";
import config from "./config.js";
import logger from "./logger.js";

// --- OCI Auth & Clients ---
const provider = new oci.common.SimpleAuthenticationDetailsProvider(
  config.oci.tenancy,
  config.oci.user,
  config.oci.fingerprint,
  config.oci.privateKeyContent,
  null,
  oci.common.Region.fromRegionId(config.oci.region)
);

const computeClient = new oci.core.ComputeClient({
  authenticationDetailsProvider: provider,
});

const waiters = computeClient.createWaiters();

// ❌ Never auto-retry API calls — we control cadence manually
const noRetryConfig = {
  terminationStrategy: new oci.common.MaxAttemptsTerminationStrategy(1),
};

// --- Email Transport ---
const mailTransport =
  config.mail.host &&
  nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth:
      config.mail.user && config.mail.pass
        ? {
            user: config.mail.user,
            pass: config.mail.pass,
          }
        : undefined,
  });

/**
 * Sends an email notification.
 */
export async function sendNotification(subject, text) {
  if (!mailTransport) {
    logger.info("📭 Email not configured. Skipping notification.");
    return;
  }
  try {
    await mailTransport.sendMail({
      from: `"OCI VM Notifier" <${config.mail.user || "noreply@localhost"}>`,
      to: config.mail.to || config.mail.user,
      subject,
      text,
    });
    logger.info("📧 Email notification sent.");
  } catch (err) {
    logger.error("Email send failed:", err);
  }
}

/**
 * Checks for a running, existing VM with the configured name.
 */
export async function getExistingVM() {
  logger.info(`🔎 Checking for existing VM '${config.vm.vmName}'...`);
  try {
    const resp = await computeClient.listInstances(
      {
        compartmentId: config.vm.compartmentId,
        displayName: config.vm.vmName,
      },
      { retryConfiguration: noRetryConfig }
    );
    return resp.items.find(
      (i) =>
        i.lifecycleState !==
          oci.core.models.Instance.LifecycleState.Terminated &&
        i.lifecycleState !== oci.core.models.Instance.LifecycleState.Terminating
    );
  } catch (err) {
    logger.error("listInstances error:", err);
    return null;
  }
}

/**
 * Attempts to create the initial (1 OCPU) VM instance.
 */
export async function createVM() {
  logger.info("⚙️ Attempting to create new VM (1 OCPU, 6 GB)...");
  const launchDetails = {
    compartmentId: config.vm.compartmentId,
    availabilityDomain: config.vm.availabilityDomain,
    displayName: config.vm.vmName,
    shape: config.vm.initialShape,
    shapeConfig: config.vm.initialShapeConfig,
    sourceDetails: { sourceType: "image", imageId: config.vm.imageId },
    createVnicDetails: { subnetId: config.vm.subnetId, assignPublicIp: true },
    metadata: { ssh_authorized_keys: config.vm.sshPublicKey },
  };

  const { instance } = await computeClient.launchInstance(
    { launchInstanceDetails: launchDetails },
    { retryConfiguration: noRetryConfig }
  );

  logger.info(`🎉 Launch initiated: ${instance.id}`);
  logger.info(`⏳ Waiting for VM to become RUNNING...`);
  // CRITICAL: Wait for RUNNING before attempting the upgrade
  await waiters.forInstance(
    { instanceId: instance.id },
    oci.core.models.Instance.LifecycleState.Running
  );
  logger.info(`✅ Initial VM is RUNNING: ${instance.id}`);

  await sendNotification(
    "✅ OCI VM Created (Initial Shape)",
    `VM ${config.vm.vmName} created and RUNNING.\nID: ${instance.id}`
  );

  return instance;
}

/**
 * Upgrades the VM instance to the final (4 OCPU) shape.
 */
export async function upgradeVM(instanceId) {
  const finalConfig = config.vm.finalShapeConfig;
  logger.info(
    `🔧 Upgrading VM ${instanceId} to ${finalConfig.ocpus} OCPUs / ${finalConfig.memoryInGBs}GB...`
  );
  await computeClient.updateInstance(
    {
      instanceId,
      updateInstanceDetails: {
        shape: config.vm.finalShape,
        shapeConfig: finalConfig,
      },
    },
    { retryConfiguration: noRetryConfig }
  );

  logger.info("⏳ Waiting for VM to be RUNNING post-upgrade...");
  await waiters.forInstance(
    { instanceId },
    oci.core.models.Instance.LifecycleState.Running
  );

  logger.info("🚀 VM upgrade complete.");
  await sendNotification(
    "🚀 OCI VM Upgraded (Final Shape)",
    `VM ${instanceId} upgraded to ${finalConfig.ocpus} OCPUs, ${finalConfig.memoryInGBs}GB RAM.`
  );
}
