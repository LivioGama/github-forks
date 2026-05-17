import PocketBase from 'pocketbase';
import { config } from 'dotenv';

config({ path: '.env.local' });

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

async function exportSchema() {
  try {
    // Authenticate as admin
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      await pb.admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );
      console.log('✓ Authenticated as admin');
    }

    // Get all collections
    const collections = await pb.collections.getFullList();
    console.log(`\nFound ${collections.length} collections:\n`);

    for (const collection of collections) {
      console.log(`Collection: ${collection.name}`);
      console.log(`  ID: ${collection.id}`);
      console.log(`  Type: ${collection.type}`);
      console.log(`  Fields (${collection.fields.length}):`);
      
      for (const field of collection.fields) {
        console.log(`    - ${field.name} (${field.type})`);
        console.log(`      Required: ${field.required}`);
        console.log(`      Hidden: ${field.hidden}`);
        console.log(`      Presentable: ${field.presentable}`);
        if (field.options) console.log(`      Options: ${field.options.join(', ')}`);
        if (field.default) console.log(`      Default: ${field.default}`);
      }
      console.log('');
    }

    // Export to JSON file
    const exportData = {
      collections: collections.map(c => ({
        name: c.name,
        id: c.id,
        type: c.type,
        fields: c.fields,
      })),
    };

    const fs = await import('fs');
    fs.writeFileSync('pocketbase-schema-export.json', JSON.stringify(exportData, null, 2));
    console.log('✓ Schema exported to pocketbase-schema-export.json');
  } catch (error: any) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

exportSchema();
