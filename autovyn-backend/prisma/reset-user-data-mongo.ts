import 'dotenv/config';
import { execFileSync } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL?.trim();

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const collections = [
  'refresh_tokens',
  'ars_requests',
  'leave_requests',
  'attendance_days',
  'announcements',
  'holidays',
  'policies',
  'credentials',
  'project_assignments',
  'projects',
  'screenshots',
  'work_heartbeats',
  'users'
];

const resetScript = `
const collections = ${JSON.stringify(collections)};
const existing = new Set(db.getCollectionNames());
for (const name of collections) {
  if (!existing.has(name)) {
    print(\`skip \${name} (missing)\`);
    continue;
  }
  const result = db.getCollection(name).deleteMany({});
  print(\`cleared \${name}: \${result.deletedCount ?? 0}\`);
}
`;

execFileSync('mongosh', [DATABASE_URL, '--quiet', '--eval', resetScript], {
  stdio: 'inherit'
});
