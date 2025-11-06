// src/logger.js
import winston from "winston";

const { combine, timestamp, errors, colorize, printf } = winston.format;

// --- JSON File Format (Machine Readable with Enforced Order) ---
const enforcedJsonFormat = printf((info) => {
  // Collect the core fields
  const { level, timestamp, message, stack, ...rest } = info;

  // Create the base object with the desired order
  const logEntry = {
    level: level,
    timestamp: timestamp,
    message: message,
  };

  // Add stack trace if it exists (for errors)
  if (stack) {
    logEntry.stack = stack;
  }

  // Add any other metadata passed to the logger
  Object.assign(logEntry, rest);

  // Stringify the resulting object
  return JSON.stringify(logEntry);
});

// --- Console Format (Human Readable) ---
// Custom format for console output (Timestamp first)
const readableFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${message}${stack ? "\n" + stack : ""}`;
});

// Logger for file (JSON format) and console (readable & colorized)
const logger = winston.createLogger({
  level: "info",
  // Base format combines errors, timestamp, and the custom JSON builder
  format: combine(
    errors({ stack: true }), // Extract stack trace into 'stack' field
    timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }), // Formats the time into the 'timestamp' field
    enforcedJsonFormat // Guarantees the order of fields
  ),
  transports: [
    // 1. File Transport: Structured JSON error log (inherits enforcedJsonFormat)
    new winston.transports.File({
      filename: "logs/oci-vm-creator-error.log",
      level: "error",
      // Note: We let it inherit the combined format defined above
    }),
    // 2. File Transport: Structured JSON general log (inherits enforcedJsonFormat)
    new winston.transports.File({
      filename: "logs/oci-vm-creator.log",
      level: "info",
      // Note: We let it inherit the combined format defined above
    }),

    // 3. Console Transport: Readable and colorized (uses custom format)
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: "HH:mm:ss.SSS" }), // Simpler time for console
        readableFormat
      ),
    }),
  ],
});

export default logger;
