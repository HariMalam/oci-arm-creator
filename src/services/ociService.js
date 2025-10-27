const oci = require('oci-sdk');
const config = require('../config');

// Set up OCI authentication provider
const provider = new oci.common.SimpleAuthenticationDetailsProvider(
    config.tenancy,
    config.user,
    config.fingerprint,
    config.privateKey,
    null, // passphrase
    oci.common.Region.fromRegionId(config.region)
);

const computeClient = new oci.core.ComputeClient({ authenticationDetailsProvider: provider });

/**
 * Checks if the target VM already exists.
 * @returns {Promise<boolean>} - True if VM exists, false otherwise.
 */
async function checkVM() {
    try {
        const listInstancesRequest = {
            compartmentId: config.compartmentId,
            displayName: config.vmDisplayName,
            lifecycleState: "RUNNING",
        };

        const response = await computeClient.listInstances(listInstancesRequest);

        if (response.items.length > 0) {
            console.log(`VM "${config.vmDisplayName}" already exists.`);
            return true; // VM found
        }

        console.log(`VM "${config.vmDisplayName}" not found. Proceeding...`);
        return false; // VM not found

    } catch (error) {
        console.error("Error checking for VM:", error.message);
        return true; // Stop on error
    }
}

/**
 * Attempts to launch the VM.
 * @returns {Promise<boolean>} - True if successful or fatal error, false if retry is needed.
 */
async function tryCreateVM() {
    console.log("Attempting to create VM...");
    try {
        const launchInstanceDetails = {
            compartmentId: config.compartmentId,
            availabilityDomain: config.availabilityDomain,
            shape: "VM.Standard.A1.Flex",
            shapeConfig: {
                ocpus: config.ocpus,
                memoryInGBs: config.memoryInGBs,
            },
            subnetId: config.subnetId,
            sourceDetails: {
                sourceType: "image",
                imageId: config.imageId,
            },
            displayName: config.vmDisplayName,
            metadata: {
                ssh_authorized_keys: config.sshKey,
            },
            createVnicDetails: {
                subnetId: config.subnetId,
                assignPublicIp: true,
            },
        };

        const response = await computeClient.launchInstance({
            launchInstanceDetails: launchInstanceDetails,
            retryConfiguration: { retryOptions: { maxAttempts: 1 } }
        });

        console.log("✅ SUCCESS! VM creation initiated:", response.instance.id);
        return true; // Signal success

    } catch (error) {
        if (error.statusCode === 500 && error.message.includes("Out of host capacity")) {
            console.log("❌ Capacity Error. Will retry in 5 minutes.");
        } else {
            console.error("⛔️ FATAL ERROR:", error.message);
            return true; // Signal to stop on fatal errors
        }
    }
    return false; // Signal to keep retrying
}

module.exports = {
    checkVM,
    tryCreateVM
};