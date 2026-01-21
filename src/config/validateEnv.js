/**
 * Environment Validation
 * 
 * This module provides a wrapper around the new unified config loader.
 * The actual validation is now performed by Joi in src/config/index.js.
 * 
 * @deprecated Use initConfig() or getConfig() from './index.js' directly.
 * This file is kept for backward compatibility.
 */

import { initConfig } from './index.js';

/**
 * Validate environment variables.
 * Initializes the config system and validates all env vars using Joi.
 * 
 * @throws {Error} If required environment variables are missing or invalid
 * @deprecated Use initConfig() from './index.js' directly
 */
export function validateEnv() {
  initConfig();
}

export default validateEnv;

