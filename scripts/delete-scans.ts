import PocketBase from 'pocketbase';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

async function deleteScans() {
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

  // Collections to clear in dependency order (scans must be last)
  const collections = ['chunks', 'jobs', 'diffs', 'forks', 'scans'];
  let totalDeleted = 0;

  for (const collectionName of collections) {
    console.log(`\nDeleting records from ${collectionName} collection...`);

    let page = 1;
    let collectionDeleted = 0;
    const perPage = 100;

    while (true) {
      const result = await pb.collection(collectionName).getList(page, perPage);
      
      if (result.items.length === 0) break;

      // Delete all records in this page
      for (const item of result.items) {
        try {
          await pb.collection(collectionName).delete(item.id);
          collectionDeleted++;
          totalDeleted++;
        } catch (deleteErr: any) {
          console.error(`  Failed to delete record ${item.id}:`, deleteErr.message);
        }
      }

      console.log(`  Deleted ${result.items.length} records (total: ${collectionDeleted})`);
      page++;
    }

    console.log(`✓ Deleted ${collectionDeleted} records from ${collectionName}`);
  }

  console.log(`\n✓ Deleted ${totalDeleted} total records across all collections`);
}

deleteScans()
  .then(() => {
    console.log('Scan deletion completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Scan deletion failed:', err);
    process.exit(1);
  });
