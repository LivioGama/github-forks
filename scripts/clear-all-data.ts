import PocketBase from 'pocketbase';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

async function clearAllData() {
  const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

  // Authenticate as admin
  if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
    try {
      // Try _superusers first (PocketBase v0.23+)
      await pb.collection('_superusers').authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );
    } catch {
      // Fall back to legacy admins
      await (pb as any).admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );
    }
    console.log('✓ Authenticated as admin');
  } else {
    console.error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD');
    process.exit(1);
  }

  // Collections to clear (in dependency order)
  const collections = ['chunks', 'jobs', 'diffs', 'forks', 'scans'];

  for (const collectionName of collections) {
    try {
      console.log(`\nClearing ${collectionName} collection...`);

      // Get all records
      let page = 1;
      let totalDeleted = 0;
      const perPage = 100;

      while (true) {
        const result = await pb.collection(collectionName).getList(page, perPage);
        
        if (result.items.length === 0) break;

        // Delete all records in this page
        for (const item of result.items) {
          try {
            await pb.collection(collectionName).delete(item.id);
            totalDeleted++;
          } catch (deleteErr: any) {
            console.error(`  Failed to delete record ${item.id}:`, deleteErr.message);
          }
        }

        console.log(`  Deleted ${result.items.length} records (total: ${totalDeleted})`);
        page++;
      }

      console.log(`✓ Cleared ${totalDeleted} records from ${collectionName}`);
    } catch (err: any) {
      if (err.status === 404) {
        console.log(`✓ ${collectionName} collection does not exist, skipping`);
      } else {
        console.error(`Failed to clear ${collectionName}:`, err.message);
      }
    }
  }

  console.log('\n✓ All data cleared successfully');
}

clearAllData()
  .then(() => {
    console.log('Data clearing completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Data clearing failed:', err);
    process.exit(1);
  });
