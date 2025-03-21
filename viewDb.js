const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'twitter.db');
const db = new sqlite3.Database(dbPath);

console.log('Database Contents:\n');

// View subscriptions
console.log('=== Subscriptions Table ===');
db.all('SELECT * FROM subscriptions', (err, rows) => {
    if (err) {
        console.error('Error reading subscriptions:', err);
    } else {
        console.log('\nTotal subscriptions:', rows.length);
        rows.forEach(row => {
            console.log(`\nID: ${row.id}`);
            console.log(`Email: ${row.email}`);
            console.log(`Username: ${row.username}`);
            console.log(`Created at: ${row.created_at}`);
        });
    }

    // View tweets
    console.log('\n=== Tweets Table ===');
    db.all('SELECT * FROM tweets', (err, rows) => {
        if (err) {
            console.error('Error reading tweets:', err);
        } else {
            console.log('\nTotal tweets stored:', rows.length);
            rows.forEach(row => {
                console.log(`\nTweet ID: ${row.tweet_id}`);
                console.log(`Username: ${row.username}`);
                console.log(`Email: ${row.email}`);
                console.log(`Content: ${row.content}`);
                console.log(`Created at: ${row.created_at}`);
                console.log(`Fetched at: ${row.fetched_at}`);
            });
        }
        
        // Close the database connection
        db.close();
    });
});
