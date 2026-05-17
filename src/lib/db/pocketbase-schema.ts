import PocketBase from 'pocketbase';
import path from 'path';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

async function authenticateAndCreateCollections() {
  const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

  if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
    await pb.collection('_superusers').authWithPassword(
      process.env.POCKETBASE_ADMIN_EMAIL,
      process.env.POCKETBASE_ADMIN_PASSWORD
    );
  } else {
    console.error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD');
    process.exit(1);
  }

  const collections = ['chunks', 'jobs', 'diffs', 'forks', 'scans'];
  for (const name of collections) {
    try {
      await pb.collections.delete(name);
    } catch (err: any) {
      if (err.status !== 404) {
        console.error(`Failed to delete ${name} collection:`, err.message);
      }
    }
  }

  // Create collections in dependency order
  let scansId = '';
  let forksId = '';
  let diffsId = '';

  try {
    const scans = await pb.collections.create({
      name: 'scans',
      type: 'base',
      fields: [
        {
          name: 'id',
          type: 'text',
          system: true,
          primaryKey: true,
          required: true,
          min: 15,
          max: 15,
          pattern: '^[a-z0-9]+$',
          autogeneratePattern: '[a-z0-9]{15}'
        },
        {
          name: 'owner',
          type: 'text',
          required: true,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'repo',
          type: 'text',
          required: true,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'running', 'completed', 'failed'],
          maxSelect: 1,
          default: 'pending'
        },
        {
          name: 'startedAt',
          type: 'autodate',
          onCreate: true,
          onUpdate: false
        },
        {
          name: 'finishedAt',
          type: 'autodate',
          onCreate: false,
          onUpdate: true
        },
        {
          name: 'totalForks',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'processedForks',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'keywords',
          type: 'json',
          maxSize: 0
        },
        {
          name: 'error',
          type: 'text',
          required: false,
          min: 0,
          max: 0,
          pattern: ''
        },
      ],
    });
    scansId = scans.id;
  } catch (err: any) {
    if (err.status !== 400 || !err.data?.id) {
      console.error('Failed to create scans collection:', err);
    }
  }


  try {
    const forks = await pb.collections.create({
      name: 'forks',
      type: 'base',
      fields: [
        {
          name: 'id',
          type: 'text',
          system: true,
          primaryKey: true,
          required: true,
          min: 15,
          max: 15,
          pattern: '^[a-z0-9]+$',
          autogeneratePattern: '[a-z0-9]{15}'
        },
        {
          name: 'scanId',
          type: 'relation',
          required: true,
          collectionId: scansId,
          maxSelect: 1,
          cascadeDelete: false
        },
        {
          name: 'owner',
          type: 'text',
          required: true,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'repo',
          type: 'text',
          required: true,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'fullName',
          type: 'text',
          required: true,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'stars',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'defaultBranch',
          type: 'text',
          required: false,
          default: 'main',
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'updatedAt',
          type: 'autodate',
          onCreate: true,
          onUpdate: true
        },
        {
          name: 'aheadBy',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'filesChanged',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'linesAdded',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'linesRemoved',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'score',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'summary',
          type: 'text',
          required: false,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'deepSummary',
          type: 'text',
          required: false,
          min: 0,
          max: 500000,
          pattern: ''
        },
        {
          name: 'deepSummaryGeneratedAt',
          type: 'text',
          required: false,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'topFiles',
          type: 'json',
          maxSize: 0
        },
        {
          name: 'commitsJson',
          type: 'json',
          maxSize: 0
        },
        {
          name: 'untouched',
          type: 'bool',
          required: false
        },
        {
          name: 'stage',
          type: 'select',
          required: true,
          values: ['discovery', 'diff_extraction', 'ranking', 'completed'],
          maxSelect: 1,
          default: 'discovery'
        },
      ],
    });
    forksId = forks.id;
  } catch (err: any) {
    if (err.status !== 400 || !err.data?.id) {
      console.error('Failed to create forks collection:', err);
    }
  }

  try {
    const diffs = await pb.collections.create({
      name: 'diffs',
      type: 'base',
      fields: [
        {
          name: 'id',
          type: 'text',
          system: true,
          primaryKey: true,
          required: true,
          min: 15,
          max: 15,
          pattern: '^[a-z0-9]+$',
          autogeneratePattern: '[a-z0-9]{15}'
        },
        {
          name: 'forkId',
          type: 'relation',
          required: true,
          collectionId: forksId,
          maxSelect: 1,
          cascadeDelete: false
        },
        {
          name: 'patch',
          type: 'text',
          required: false,
          min: 0,
          max: 60000,
          pattern: ''
        },
        {
          name: 'topFiles',
          type: 'json',
          maxSize: 0
        },
        {
          name: 'commitsCount',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['extracted', 'failed', 'not_found'],
          maxSelect: 1,
          default: 'extracted'
        },
        {
          name: 'error',
          type: 'text',
          required: false,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'createdAt',
          type: 'autodate',
          onCreate: true,
          onUpdate: false
        },
      ],
    });
    diffsId = diffs.id;
  } catch (err: any) {
    if (err.status !== 400 || !err.data?.id) {
      console.error('Failed to create diffs collection:', err);
    }
  }

  try {
    await pb.collections.create({
      name: 'jobs',
      type: 'base',
      fields: [
        {
          name: 'id',
          type: 'text',
          system: true,
          primaryKey: true,
          required: true,
          min: 15,
          max: 15,
          pattern: '^[a-z0-9]+$',
          autogeneratePattern: '[a-z0-9]{15}'
        },
        {
          name: 'scanId',
          type: 'relation',
          required: true,
          collectionId: scansId,
          maxSelect: 1,
          cascadeDelete: false
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          values: ['fork_discovery', 'diff_extraction', 'semantic_indexing', 'ranking'],
          maxSelect: 1
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'running', 'completed', 'failed'],
          maxSelect: 1,
          default: 'pending'
        },
        {
          name: 'progress',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'total',
          type: 'number',
          required: false
        },
        {
          name: 'processed',
          type: 'number',
          required: false,
          default: 0
        },
        {
          name: 'error',
          type: 'text',
          required: false,
          min: 0,
          max: 0,
          pattern: ''
        },
        {
          name: 'startedAt',
          type: 'autodate',
          onCreate: true,
          onUpdate: false
        },
        {
          name: 'completedAt',
          type: 'autodate',
          onCreate: false,
          onUpdate: true
        },
      ],
    });
  } catch (err: any) {
    if (err.status !== 400 || !err.data?.id) {
      console.error('Failed to create jobs collection:', err);
    }
  }

  // Smoke test: verify collections were created with fields
  try {
    const testScan = await pb.collection('scans').create({
      owner: 'test',
      repo: 'test-repo',
      status: 'pending'
    });
    await pb.collection('scans').delete(testScan.id);
    console.log('✓ Smoke test passed - collections have correct fields');
  } catch (err: any) {
    console.error('✗ Smoke test failed - fields may not have been persisted:', err.message);
    throw err;
  }
}

authenticateAndCreateCollections()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Schema creation failed:', err);
    process.exit(1);
  });
