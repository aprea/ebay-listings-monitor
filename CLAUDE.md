# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an automated eBay listings monitor that searches for Pokémon booster boxes on eBay Australia within specific price ranges ($200-$350 AUD). It continuously monitors for new listings, filters out foreign editions and unreliable sellers, sends Discord notifications, and tracks processed listings in a PostgreSQL database to prevent duplicate alerts.

## Commands

### Development
```bash
# Install dependencies
bun install

# Run the application (normal monitoring mode)
bun run index.ts

# Seed the database with current listings (no Discord notifications)
bun run index.ts --seed

# Database migrations (using Drizzle Kit)
bunx drizzle-kit generate
bunx drizzle-kit migrate
bunx drizzle-kit push
```

### Code Formatting
```bash
# Format code with Prettier
bunx prettier --write .
```

## Architecture

### Core Components

1. **Main Application** (`index.ts`): 
   - Runs every minute via cron schedule
   - Searches eBay for English Pokémon booster boxes with complex filters
   - Filters sellers by feedback percentage (≥95% required)
   - Tracks processed listings to avoid duplicate notifications
   - Sends rich Discord embeds with listing details and images

2. **Database Layer** (`src/db/`):
   - Uses Drizzle ORM with PostgreSQL
   - Schema defines `listings` table with `id` and `itemId` fields
   - Optimized batch operations for performance

3. **Integration Points**:
   - **eBay API**: Searches with limit of 50 items, sorted by newest
   - **Discord Bot**: Sends embedded notifications with price, shipping, images
   - **Cron Scheduling**: Runs monitoring task every minute
   - **Database**: Tracks all processed listings using Set-based lookups

### Performance Optimizations
- Single database query to fetch all processed listings at startup
- Set data structure for O(1) duplicate checking
- Batch database inserts for new listings
- Early exit when no new listings found

### Environment Variables Required
- `EBAY_PRODUCTION_CLIENT_ID`
- `EBAY_PRODUCTION_CLIENT_SECRET`
- `DATABASE_URL`
- `DISCORD_BOT_SECRET`

### Key Implementation Details
- Uses Bun runtime for fast execution
- TypeScript with strict mode enabled
- Filters for Australian sellers only with AUD currency
- Extensive exclusion list for foreign Pokémon TCG set symbols
- Minimum 95% seller feedback requirement
- Calculates total price including shipping in notifications