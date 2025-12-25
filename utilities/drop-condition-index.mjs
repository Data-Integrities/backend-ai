import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://192.168.1.40:27017');
await client.connect();

const db = client.db('patient');
const conditionCol = db.collection('patient_condition');

console.log('Dropping old index...');
try {
    await conditionCol.dropIndex('patient_id_1_condition_id_1');
    console.log('✅ Index dropped');
} catch (e) {
    console.log('Index might not exist:', e.message);
}

// List remaining indexes
const indexes = await conditionCol.indexes();
console.log('\nRemaining indexes:');
indexes.forEach(idx => {
    console.log(' -', idx.name, ':', JSON.stringify(idx.key));
});

await client.close();
