// Migrations are no longer needed with Firestore.
// Firestore is schemaless - collections and fields are created on first write.
// Use initDb.js to seed initial data.

console.log('Migrations are not needed with Firestore.');
console.log('Run "npm run init-db" to seed initial data instead.');
process.exit(0);
