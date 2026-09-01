/**
 * Simple helper to load environment variables from .env file
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  try {
    // Read the .env file from the project root
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Parse each line and set the environment variables
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) return;
      
      // Extract key and value
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["'](.*)["']$/, '$1'); // Remove quotes if present
        
        // Set environment variable — but never clobber one that is already
        // set in the environment (standard dotenv semantics; lets test runs
        // point DATABASE_URL at a dedicated test database).
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    });
    
    console.log('Environment variables loaded from .env file');
  } catch (error) {
    console.warn('Warning: Failed to load .env file:', error.message);
  }
}

module.exports = { loadEnv };
