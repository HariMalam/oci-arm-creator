import "dotenv/config"; // Load .env file at the top
import express from "express";
import * as oci from "oci-sdk";
import nodemailer from "nodemailer";
import { consola } from "consola"; // ✨ Import consola

// --- Configuration ---
const config = {
  port: process.env.PORT || 3000,
  retryIntervalMs: parseInt(process.env.RETRY_INTERVAL_MS || "30000", 10),

  oci: {
    tenancy: process.env.OCI_TENANCY_ID,
    user: process.env.OCI_USER_ID,
    fingerprint: process.env.OCI_FINGERPRINT,
    privateKeyContent: process.env.OCI_PRIVATE_KEY_CONTENT,
    region: process.env.OCI_REGION,
  },

  vm: {
    compartmentId: process.env.COMPARTMENT_ID,
    availabilityDomain: process.env.AVAILABILITY_DOMAIN,
    subnetId: process.env.SUBNET_ID,
    imageId: process.env.IMAGE_ID,
    sshPublicKey: process.env.SSH_PUBLIC_KEY,
    vmName: process.env.VM_NAME || "oci-auto-created-vm",
    // Shape for initial creation (1 OCPU, 6GB RAM)
    initialShape: "VM.Standard.A1.Flex",
    initialShapeConfig: {
      ocpus: 1,
      memoryInGBs: 6,
    },
    // Shape for upgrade (4 OCPU, 24GB RAM)
    finalShape: "VM.Standard.A1.Flex",
    finalShapeConfig: {
      ocpus: 4,
      memoryInGBs: 24,
    },
  },

  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || "587", 10),
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    to: process.env.MAIL_TO,
  },
};

// --- OCI Authentication ---
// Use SimpleAuthenticationDetailsProvider for container-friendly auth

const provider = new oci.common.SimpleAuthenticationDetailsProvider(
  config.oci.tenancy,
  config.oci.user,
  config.oci.fingerprint,
  config.oci.privateKeyContent,
  null, // No passphrase
  oci.common.Region.fromRegionId(config.oci.region)
);

const computeClient = new oci.core.ComputeClient({
  authenticationDetailsProvider: provider,
});
const waiters = computeClient.createWaiters();

const noRetryConfig = {
  terminationStrategy: new oci.common.MaxAttemptsTerminationStrategy(1),
};

// --- Nodemailer Transport ---
const mailTransport = nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  secure: config.mail.port === 465, // true for 465, false for other ports
  auth: {
    user: config.mail.user,
    pass: config.mail.pass,
  },
});

// --- Core Application Logic ---

/**
 * Sends an email notification.
 */
async function sendNotification(subject, text) {
  if (!config.mail.host) {
    consola.warn("Mail host not configured, skipping email notification.");
    return;
  }
  consola.info(`Attempting to send email: ${subject}`);
  try {
    await mailTransport.sendMail({
      from: `"OCI VM Notifier" <${config.mail.user}>`,
      to: config.mail.to,
      subject: subject,
      text: text,
    });
    consola.success("Email notification sent successfully.");
  } catch (error) {
    consola.error("Failed to send email notification:", error);
  }
}

/**
 * Checks if the VM already exists and is in a usable state.
 */
async function getExistingVM() {
  consola.info(`Checking for existing VM named '${config.vm.vmName}'...`);
  try {
    const response = await computeClient.listInstances(
      {
        compartmentId: config.vm.compartmentId,
        displayName: config.vm.vmName,
      },
      { retryConfiguration: noRetryConfig }
    );

    // Filter out terminated instances
    const runningInstance = response.items.find(
      (instance) =>
        instance.lifecycleState !==
          oci.core.models.Instance.LifecycleState.Terminated &&
        instance.lifecycleState !==
          oci.core.models.Instance.LifecycleState.Terminating
    );

    if (runningInstance) {
      return runningInstance;
    }
    return null; // No active instance found
  } catch (error) {
    consola.error("Error listing instances:", error);
    return null; // Assume no instance on error
  }
}

/**
 * Attempts to create the VM with the initial small shape.
 */
async function createVM() {
  consola.info("Attempting to create new VM...");

  const launchDetails = {
    compartmentId: config.vm.compartmentId,
    availabilityDomain: config.vm.availabilityDomain,
    displayName: config.vm.vmName,
    shape: config.vm.initialShape,
    shapeConfig: config.vm.initialShapeConfig,
    sourceDetails: {
      sourceType: "image",
      imageId: config.vm.imageId,
    },
    createVnicDetails: {
      subnetId: config.vm.subnetId,
      assignPublicIp: true, // Automatically assign a public IP
    },
    metadata: {
      ssh_authorized_keys: config.vm.sshPublicKey,
    },
  };

  const response = await computeClient.launchInstance(
    {
      launchInstanceDetails: launchDetails,
    },
    { retryConfiguration: noRetryConfig }
  );

  const instanceId = response.instance.id;
  consola.info(`VM creation initiated: ${instanceId}`);

  // Wait for the instance to be in the 'RUNNING' state
  consola.info(`Waiting for VM ${instanceId} to enter 'RUNNING' state...`);
  const getInstanceRequest = { instanceId: instanceId };
  await waiters.forInstance(
    getInstanceRequest,
    oci.core.models.Instance.LifecycleState.Running
  );
  consola.success(`VM ${instanceId} is now RUNNING.`);

  await sendNotification(
    "✅ OCI VM Created!",
    `VM ${config.vm.vmName} has been successfully created with ID: ${instanceId}\n\nIt is now in the RUNNING state.`
  );

  return response.instance;
}

/**
 * Upgrades the VM to the final, larger shape.
 */
async function upgradeVM(instanceId) {
  consola.info(`Attempting to upgrade VM ${instanceId}...`);

  const updateDetails = {
    shape: config.vm.finalShape,
    shapeConfig: config.vm.finalShapeConfig,
  };

  await computeClient.updateInstance(
    {
      instanceId: instanceId,
      updateInstanceDetails: updateDetails,
    },
    { retryConfiguration: noRetryConfig }
  );

  consola.info(`VM ${instanceId} upgrade initiated.`);

  // Wait for the instance to return to the 'RUNNING' state after upgrading
  consola.info(`Waiting for VM ${instanceId} to finish upgrading...`);
  const getInstanceRequest = { instanceId: instanceId };
  await waiters.forInstance(
    getInstanceRequest,
    oci.core.models.Instance.LifecycleState.Running
  );
  consola.success(`VM ${instanceId} is now RUNNING with upgraded shape.`);

  await sendNotification(
    "🚀 OCI VM Upgraded!",
    `VM ${instanceId} has been successfully upgraded to ${config.vm.finalShapeConfig.ocpus} OCPUs and ${config.vm.finalShapeConfig.memoryInGBs}GB RAM.`
  );
}

/**
 * The main job loop that runs on a timer.
 */
async function runCheck() {
  consola.info("--- 🔍 Running OCI VM Check ---");
  try {
    const existingVM = await getExistingVM();

    if (existingVM) {
      consola.success(
        `✅ VM ${existingVM.displayName} (ID: ${existingVM.id}) already exists.`
      );

      // Check if it needs an upgrade
      if (
        existingVM.shapeConfig?.ocpus !== config.vm.finalShapeConfig.ocpus ||
        existingVM.shapeConfig?.memoryInGBs !==
          config.vm.finalShapeConfig.memoryInGBs
      ) {
        consola.warn("⚠️ VM shape is incorrect. Initiating upgrade...");
        if (
          existingVM.lifecycleState ===
          oci.core.models.Instance.LifecycleState.Running
        ) {
          await upgradeVM(existingVM.id);
        } else {
          consola.warn(
            `⏳ VM is not in RUNNING state (State: ${existingVM.lifecycleState}). Skipping upgrade check until it is.`
          );
        }
      } else {
        consola.success(
          "🚀 VM is already at the final shape. No action needed."
        );
      }
      return;
    }

    // VM does not exist, try to create it
    const newInstance = await createVM();

    // If creation succeeds, upgrade it
    if (newInstance) {
      await upgradeVM(newInstance.id);
    }
  } catch (error) {
    if (
      error.statusCode === 500 &&
      error.message &&
      error.message.includes("Out of host capacity")
    ) {
      consola.warn("🕒 No capacity available. Will retry...");
    } else {
      consola.error("❌ An unexpected error occurred:", error);
      await sendNotification(
        "❌ OCI VM Job FAILED!",
        `An unexpected error occurred:\n\n${error.message}\n\nStack:\n${error.stack}`
      );
    }
  }
}

// --- Express Server ---
const app = express();

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  consola.success("🚀 OCI VM Creator is running.");
  consola.info(
    `🩺 Health check available at http://localhost:${config.port}/health`
  );
  consola.info(
    `🔄 Checking for VM capacity every ${
      config.retryIntervalMs / 1000
    } seconds.`
  );

  // Start the main loop
  setInterval(runCheck, config.retryIntervalMs);

  // Run one check immediately on start
  runCheck();
});
