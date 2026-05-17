import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

export async function POST() {
  try {
    const pb = new PocketBase(process.env.POCKETBASE_URL || "http://localhost:8090");
    
    // Authenticate as admin
    const email = process.env.POCKETBASE_ADMIN_EMAIL;
    const password = process.env.POCKETBASE_ADMIN_PASSWORD;
    
    if (!email || !password) {
      throw new Error("Missing admin credentials");
    }
    
    await pb.admins.authWithPassword(email, password);
    
    // Clear all collections in dependency order
    const collections = ["diffs", "forks", "jobs", "scans"];
    
    for (const collection of collections) {
      try {
        const records = await pb.collection(collection).getFullList({
          perPage: 1000,
        });
        
        // Delete in parallel for efficiency
        await Promise.all(records.map(record => pb.collection(collection).delete(record.id)));
      } catch (err) {
        console.error(`Failed to clear ${collection}:`, err);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to clear database:", err);
    return NextResponse.json(
      { error: "Failed to clear database" },
      { status: 500 }
    );
  }
}
