#!/bin/bash

# Set the database type to PostgreSQL for Vercel deployments
export DATABASE_TYPE=postgresql

# Run the database configuration check before switching
echo "Running database configuration check before switching..."
node scripts/check-db-config.js

# Run the database switching script
echo "Switching to PostgreSQL schema..."
node scripts/switch-db.js postgresql

# Run the database configuration check after switching
echo "Running database configuration check after switching..."
node scripts/check-db-config.js

# Generate Prisma client and build the application
echo "Generating Prisma client..."
npx prisma generate

# Apply pending migrations to the production database (uses DIRECT_URL).
# Without this, new tables (EmailSettings, attendance, notification indexes)
# never reach the deployed database and the affected APIs return 500.
echo "Applying database migrations..."
npx prisma migrate deploy
echo "Building Next.js application..."
npx next build
