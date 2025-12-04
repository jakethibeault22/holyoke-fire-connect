# Automatic Data Cleanup System

## Overview
Your Holyoke Fire Connect app now has automatic data cleanup to manage storage and keep the database optimized.

## Retention Policies

### Bulletins
- **Retention Period:** 2 years
- **Reason:** Official department communications that may have compliance/legal value
- **What happens:** Bulletins older than 2 years are automatically deleted

### Messages
- **Retention Period:** 1 year
- **Reason:** Day-to-day communications, less critical than official bulletins
- **What happens:** Messages older than 1 year are automatically deleted

### Attachments (Images, PDFs, Documents)
- **Retention Period:** Same as parent item
- **What happens:** When a bulletin or message is deleted, all its attachments are automatically deleted via database CASCADE rules
- **Storage saved:** This is where you save the most storage space!

## How It Works

1. **Automatic:** Cleanup runs once per day when the server starts
2. **Smart:** Only runs once per 24 hours (even if server restarts multiple times)
3. **Safe:** Uses PostgreSQL interval calculations (very reliable)
4. **Logged:** You'll see cleanup results in Render logs

## Logs to Expect

When cleanup runs, you'll see:
```
Starting data cleanup...
✓ Deleted X bulletins older than 2 years
✓ Deleted X messages older than 1 year
✓ Cleaned up X orphaned thread participants
✓ Cleaned up X orphaned bulletin read entries
✓ Cleaned up X orphaned message read entries
✓ Data cleanup completed
```

## Manual Cleanup

If you ever need to run cleanup manually (not recommended unless needed):

**In Render Shell:**
```bash
node scripts/cleanup.js
```

## Monitoring Storage

To check your current database size in Render:
1. Go to your PostgreSQL database in Render dashboard
2. Look at the "Disk" usage meter
3. Free tier = 1 GB limit

## Changing Retention Periods

If you need to adjust retention periods in the future:

**In `scripts/cleanup.js`, find these lines:**
```javascript
// Delete bulletins older than 2 years
WHERE created_at < NOW() - INTERVAL '2 years'

// Delete messages older than 1 year  
WHERE created_at < NOW() - INTERVAL '1 year'
```

**Change to (examples):**
```javascript
INTERVAL '1 year'   // 1 year
INTERVAL '6 months' // 6 months
INTERVAL '90 days'  // 90 days
INTERVAL '3 years'  // 3 years
```

## Database Impact

- **Performance:** Minimal - cleanup runs off-peak during server startup
- **Downtime:** None - cleanup runs asynchronously
- **Data integrity:** Safe - uses proper foreign key cascades

## Backup Before Cleanup

Your data is automatically backed up by Render, but if you want a manual backup before cleanup runs:

**In Render Dashboard:**
1. Go to your PostgreSQL database
2. Click "Backups" tab
3. Click "Create Backup"

## Questions?

- Cleanup not running? Check Render logs for errors
- Need to restore deleted data? Contact Render support for backup restore
- Want to disable cleanup? Remove the cleanup section from `server.js`
