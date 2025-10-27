// Validates and exports all environment variables

const config = {
    // OCI Auth
    tenancy: process.env.OCI_TENANCY,
    user: process.env.OCI_USER,
    fingerprint: process.env.OCI_FINGERPRINT,
    privateKey: process.env.OCI_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Fix newlines
    region: process.env.OCI_REGION || 'us-ashburn-1',

    // VM Config
    compartmentId: process.env.COMPARTMENT_ID,
    availabilityDomain: process.env.AVAILABILITY_DOMAIN,
    subnetId: process.env.SUBNET_ID,
    imageId: process.env.IMAGE_ID,
    vmDisplayName: process.env.VM_DISPLAY_NAME || "my-free-arm-vm",
    ocpus: parseInt(process.env.VM_OCPUS, 10) || 4,
    memoryInGBs: parseInt(process.env.VM_MEMORY, 10) || 24,
    sshKey: process.env.SSH_PUBLIC_KEY,

    // Server
    port: process.env.PORT || 3000,

    // Cron job
    cronSchedule: process.env.CRON_SCHEDULE || '*/5 * * * *'
};

// Validate essential config
if (!config.tenancy || !config.user || !config.fingerprint || !config.privateKey || !config.compartmentId) {
    console.error("FATAL ERROR: Missing required OCI environment variables.");
    process.exit(1); // Exit if essential auth is missing
}

module.exports = config;