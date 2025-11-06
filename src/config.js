import "dotenv/config";
import fs from "node:fs";

// -----------------------------
// Config (Optimal for Always Free ARM VM)
// -----------------------------
const config = {
  port: process.env.PORT || 3000,

  // ✅ Best Practice Retry Timing: 5 min base with jitter for capacity/rate limit avoidance
  baseRetryIntervalMs: parseInt(process.env.RETRY_INTERVAL_MS || "300000", 10), // 5 min
  jitterRangeMs: parseInt(process.env.JITTER_RANGE_MS || "120000", 10), // ±2 min
  startupJitterMs: parseInt(process.env.STARTUP_JITTER_MS || "0", 10), // 0–180000 (optional)
  oci: {
    tenancy: process.env.OCI_TENANCY_ID,
    user: process.env.OCI_USER_ID,
    fingerprint: process.env.OCI_FINGERPRINT,
    privateKeyContent:
      process.env.OCI_PRIVATE_KEY_CONTENT ||
      (process.env.OCI_PRIVATE_KEY_PATH
        ? fs.readFileSync(process.env.OCI_PRIVATE_KEY_PATH, "utf8")
        : undefined),
    region: process.env.OCI_REGION || "ap-mumbai-1", // Default to Mumbai
  },

  vm: {
    compartmentId: process.env.COMPARTMENT_ID,
    availabilityDomain: process.env.AVAILABILITY_DOMAIN, // REQUIRED (e.g. Uocm:AP-MUMBAI-1-AD-1)
    subnetId: process.env.SUBNET_ID,
    imageId: process.env.IMAGE_ID,
    sshPublicKey: process.env.SSH_PUBLIC_KEY,
    vmName: process.env.VM_NAME || "oci-auto-created-vm",
    // Start with the smallest Always Free ARM size
    initialShape: "VM.Standard.A1.Flex",
    initialShapeConfig: { ocpus: 1, memoryInGBs: 6 },
    // Upgrade to the max Always Free ARM size
    finalShape: "VM.Standard.A1.Flex",
    finalShapeConfig: { ocpus: 4, memoryInGBs: 24 },
  },

  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || "587", 10),
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    to: process.env.MAIL_TO,
  },
};

export default config;
