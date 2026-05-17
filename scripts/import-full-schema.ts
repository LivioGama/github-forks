import PocketBase from 'pocketbase';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

// PocketBase 0.23+ field helpers (new API: `fields` instead of `schema`,
// options flattened onto the field itself, `select` uses `values`+`maxSelect`)
const idField = () => ({
  name: 'id',
  type: 'text',
  system: true,
  primaryKey: true,
  required: true,
  hidden: false,
  presentable: false,
  min: 15,
  max: 15,
  pattern: '^[a-z0-9]+$',
  autogeneratePattern: '[a-z0-9]{15}',
});

const text = (name: string, opts: { required?: boolean; presentable?: boolean } = {}) => ({
  name,
  type: 'text',
  required: !!opts.required,
  presentable: !!opts.presentable,
  hidden: false,
  min: 0,
  max: 0,
  pattern: '',
});

const number = (name: string, opts: { required?: boolean; default?: number } = {}) => ({
  name,
  type: 'number',
  required: !!opts.required,
  hidden: false,
  onlyInt: false,
  ...(opts.default !== undefined ? { default: opts.default } : {}),
});

const date = (name: string) => ({
  name,
  type: 'date',
  required: false,
  hidden: false,
  min: '',
  max: '',
});

const autodate = (name: string, opts: { onCreate?: boolean; onUpdate?: boolean } = {}) => ({
  name,
  type: 'autodate',
  hidden: false,
  presentable: false,
  system: false,
  onCreate: opts.onCreate ?? true,
  onUpdate: opts.onUpdate ?? false,
});

const json = (name: string) => ({
  name,
  type: 'json',
  required: false,
  hidden: false,
  maxSize: 0,
});

const select = (name: string, values: string[], opts: { required?: boolean; default?: string } = {}) => ({
  name,
  type: 'select',
  required: !!opts.required,
  hidden: false,
  values,
  maxSelect: 1,
  ...(opts.default !== undefined ? { default: opts.default } : {}),
});

const relation = (
  name: string,
  collectionId: string,
  opts: { required?: boolean; cascadeDelete?: boolean } = {}
) => ({
  name,
  type: 'relation',
  required: !!opts.required,
  hidden: false,
  collectionId,
  cascadeDelete: !!opts.cascadeDelete,
  minSelect: 0,
  maxSelect: 1,
});

async function importFullSchema() {
  try {
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      // PocketBase 0.23+ unified admins into _superusers
      await pb
        .collection('_superusers')
        .authWithPassword(
          process.env.POCKETBASE_ADMIN_EMAIL,
          process.env.POCKETBASE_ADMIN_PASSWORD
        );
      console.log('✓ Authenticated as superuser');
    }

    // Delete in reverse-dependency order (relations first)
    const collectionsToDelete = ['chunks', 'jobs', 'diffs', 'forks', 'scans'];
    for (const name of collectionsToDelete) {
      try {
        await pb.collections.delete(name);
        console.log(`✓ Deleted ${name} collection`);
      } catch (err: any) {
        if (err.status === 404) {
          console.log(`✓ ${name} did not exist, skipping`);
        } else {
          console.error(`Failed to delete ${name}:`, err.message);
        }
      }
    }

    // 1. scans (no dependencies)
    const scans = await pb.collections.create({
      name: 'scans',
      type: 'base',
      fields: [
        idField(),
        text('owner', { required: true, presentable: true }),
        text('repo', { required: true, presentable: true }),
        select('status', ['pending', 'running', 'completed', 'failed'], {
          required: true,
          default: 'pending',
        }),
        date('startedAt'),
        date('finishedAt'),
        number('totalForks'),
        number('processedForks', { default: 0 }),
        json('keywords'),
        text('error'),
        autodate('created', { onCreate: true }),
        autodate('updated', { onCreate: true, onUpdate: true }),
      ],
    });
    console.log(`✓ Created scans (${scans.id})`);

    // 2. forks (relation → scans)
    const forks = await pb.collections.create({
      name: 'forks',
      type: 'base',
      fields: [
        idField(),
        relation('scanId', scans.id, { required: true }),
        text('owner', { required: true }),
        text('repo', { required: true }),
        text('fullName', { required: true }),
        number('stars', { default: 0 }),
        text('defaultBranch'),
        date('updatedAt'),
        number('aheadBy', { default: 0 }),
        number('filesChanged', { default: 0 }),
        number('linesAdded', { default: 0 }),
        number('linesRemoved', { default: 0 }),
        number('score', { default: 0 }),
        text('summary'),
        json('topFiles'),
        json('commitsJson'),
        number('semanticScore', { default: 0 }),
        select('stage', ['discovery', 'diff_extraction', 'semantic_indexing', 'ranking', 'completed'], {
          required: true,
          default: 'discovery',
        }),
        autodate('created', { onCreate: true }),
        autodate('updated', { onCreate: true, onUpdate: true }),
      ],
    });
    console.log(`✓ Created forks (${forks.id})`);

    // 3. diffs (relation → forks)
    const diffs = await pb.collections.create({
      name: 'diffs',
      type: 'base',
      fields: [
        idField(),
        relation('forkId', forks.id, { required: true }),
        text('patch'),
        json('topFiles'),
        number('commitsCount', { default: 0 }),
        select('status', ['extracted', 'failed', 'not_found'], {
          required: true,
          default: 'extracted',
        }),
        text('error'),
        autodate('created', { onCreate: true }),
        autodate('updated', { onCreate: true, onUpdate: true }),
      ],
    });
    console.log(`✓ Created diffs (${diffs.id})`);

    // 4. jobs (relation → scans)
    const jobs = await pb.collections.create({
      name: 'jobs',
      type: 'base',
      fields: [
        idField(),
        relation('scanId', scans.id, { required: true }),
        select(
          'type',
          ['fork_discovery', 'diff_extraction', 'semantic_indexing', 'ranking'],
          { required: true }
        ),
        select('status', ['pending', 'running', 'completed', 'failed'], {
          required: true,
          default: 'pending',
        }),
        number('progress', { default: 0 }),
        number('total'),
        number('processed', { default: 0 }),
        text('error'),
        date('startedAt'),
        date('completedAt'),
        autodate('created', { onCreate: true }),
        autodate('updated', { onCreate: true, onUpdate: true }),
      ],
    });
    console.log(`✓ Created jobs (${jobs.id})`);

    // 5. chunks (relation → forks)
    const chunks = await pb.collections.create({
      name: 'chunks',
      type: 'base',
      fields: [
        idField(),
        relation('forkId', forks.id, { required: true }),
        select('type', ['commit', 'diff'], { required: true }),
        text('text', { required: true }),
        number('qdrantId'),
        autodate('created', { onCreate: true }),
        autodate('updated', { onCreate: true, onUpdate: true }),
      ],
    });
    console.log(`✓ Created chunks (${chunks.id})`);

    // Verify
    const verify = await pb.collections.getOne('scans');
    console.log(
      '\n✓ scans fields:',
      verify.fields.map((f: any) => `${f.name}:${f.type}`).join(', ')
    );

    // Smoke-test insert
    console.log('\nTesting record insertion...');
    const rec = await pb.collection('scans').create({
      owner: 'test',
      repo: 'test',
      status: 'pending',
    });
    console.log('✓ Inserted scans record:', rec.id);
    await pb.collection('scans').delete(rec.id);
    console.log('✓ Cleaned up test record');
  } catch (error: any) {
    console.error('Import failed:', error?.response ?? error);
    process.exit(1);
  }
}

importFullSchema();
