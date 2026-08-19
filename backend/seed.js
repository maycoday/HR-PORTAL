const db = require('./db');

console.log('Seeding initial HR Summit data...');
const guests = db.readGuests();
console.log(`Database initialized with ${guests.length} HR records.`);
console.log('Ready!');
