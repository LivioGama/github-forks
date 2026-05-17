import PocketBase from 'pocketbase';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

async function recreateScansCollection() {
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

  try {
    // Delete collections in reverse dependency order
    const collectionsToDelete = ['jobs', 'chunks', 'diffs', 'forks', 'scans'];
    
    for (const collectionName of collectionsToDelete) {
      console.log(`Deleting ${collectionName} collection...`);
      try {
        await pb.collections.delete(collectionName);
        console.log(`✓ Deleted ${collectionName} collection`);
      } catch (err: any) {
        if (err.status === 404) {
          console.log(`✓ ${collectionName} collection does not exist`);
        } else {
          console.error(`Failed to delete ${collectionName} collection:`, err.message);
        }
      }
    }
  } catch (err: any) {
    console.error('Error during collection deletion:', err.message);
  }

  // Recreate the scans collection
  try {
    console.log('Recreating scans collection...');
    await pb.collections.create({
      name: 'scans',
      type: 'base',
      schema: [
        {
          name: 'owner',
          type: 'text',
          required: true,
          hidden: false,
          presentable: true,
        },
        {
          name: 'repo',
          type: 'text',
          required: true,
          hidden: false,
          presentable: true,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          hidden: false,
          presentable: true,
          options: ['pending', 'running', 'completed', 'failed'],
          default: 'pending',
        },
        {
          name: 'startedAt',
          type: 'date',
          hidden: false,
          presentable: true,
        },
        {
          name: 'finishedAt',
          type: 'date',
          hidden: false,
          presentable: true,
        },
        {
          name: 'totalForks',
          type: 'number',
          hidden: false,
          presentable: true,
        },
        {
          name: 'processedForks',
          type: 'number',
          hidden: false,
          presentable: true,
          default: 0,
        },
        {
          name: 'keywords',
          type: 'json',
          hidden: false,
          presentable: true,
        },
        {
          name: 'error',
          type: 'text',
          hidden: false,
          presentable: true,
        },
      ],
    });
    console.log('✓ Recreated scans collection');
  } catch (err: any) {
    console.error('Failed to recreate scans collection:', err);
    process.exit(1);
  }

  // Recreate the diffs collection
  try {
    console.log('Recreating diffs collection...');
    await pb.collections.create({
      name: 'diffs',
      type: 'base',
      schema: [
        {
          name: 'forkId',
          type: 'relation',
          required: true,
          collectionId: 'forks',
          cascadeDelete: false,
          hidden: false,
        },
        {
          name: 'patch',
          type: 'text',
          max: 60000,
          hidden: false,
        },
        {
          name: 'topFiles',
          type: 'json',
          hidden: false,
        },
        {
          name: 'commitsCount',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          options: ['extracted', 'failed', 'not_found'],
          default: 'extracted',
          hidden: false,
        },
        {
          name: 'error',
          type: 'text',
          hidden: false,
        },
        {
          name: 'createdAt',
          type: 'date',
          default: 'now',
          hidden: false,
        },
      ],
    });
    console.log('✓ Recreated diffs collection');
  } catch (err: any) {
    console.error('Failed to recreate diffs collection:', err);
    process.exit(1);
  }

  // Recreate the forks collection
  try {
    console.log('Recreating forks collection...');
    await pb.collections.create({
      name: 'forks',
      type: 'base',
      schema: [
        {
          name: 'scanId',
          type: 'relation',
          required: true,
          collectionId: 'scans',
          cascadeDelete: false,
          hidden: false,
        },
        {
          name: 'owner',
          type: 'text',
          required: true,
          hidden: false,
        },
        {
          name: 'repo',
          type: 'text',
          required: true,
          hidden: false,
        },
        {
          name: 'fullName',
          type: 'text',
          required: true,
          hidden: false,
        },
        {
          name: 'stars',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'defaultBranch',
          type: 'text',
          default: 'main',
          hidden: false,
        },
        {
          name: 'updatedAt',
          type: 'date',
          hidden: false,
        },
        {
          name: 'aheadBy',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'filesChanged',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'linesAdded',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'linesRemoved',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'score',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'summary',
          type: 'text',
          hidden: false,
        },
        {
          name: 'topFiles',
          type: 'json',
          hidden: false,
        },
        {
          name: 'commitsJson',
          type: 'json',
          hidden: false,
        },
        {
          name: 'untouched',
          type: 'bool',
          hidden: false,
        },
      ],
    });
    console.log('✓ Recreated forks collection');
  } catch (err: any) {
    console.error('Failed to recreate forks collection:', err);
    process.exit(1);
  }

  // Recreate the jobs collection
  try {
    console.log('Recreating jobs collection...');
    await pb.collections.create({
      name: 'jobs',
      type: 'base',
      schema: [
        {
          name: 'scanId',
          type: 'relation',
          required: true,
          collectionId: 'scans',
          cascadeDelete: false,
          hidden: false,
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          options: ['fork_discovery', 'diff_extraction', 'semantic_indexing', 'ranking'],
          hidden: false,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          options: ['pending', 'running', 'completed', 'failed'],
          default: 'pending',
          hidden: false,
        },
        {
          name: 'progress',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'total',
          type: 'number',
          hidden: false,
        },
        {
          name: 'processed',
          type: 'number',
          default: 0,
          hidden: false,
        },
        {
          name: 'error',
          type: 'text',
          hidden: false,
        },
        {
          name: 'startedAt',
          type: 'date',
          hidden: false,
        },
        {
          name: 'completedAt',
          type: 'date',
          hidden: false,
        },
      ],
    });
    console.log('✓ Recreated jobs collection');
  } catch (err: any) {
    console.error('Failed to recreate jobs collection:', err);
    process.exit(1);
  }

  console.log('\n✓ All collections successfully recreated');
}

recreateScansCollection()
  .then(() => {
    console.log('Operation completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Operation failed:', err);
    process.exit(1);
  });
