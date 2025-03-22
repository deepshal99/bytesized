const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'twitter.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
    // Create subscriptions table
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email, username)
    )`);

    // Create tweets table
    db.run(`CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id TEXT NOT NULL,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tweet_id, username, email)
    )`);
});

// Add new subscription
function addSubscription(email, username) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO subscriptions (email, username) VALUES (?, ?)');
        stmt.run([email, username], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
        stmt.finalize();
    });
}

// Save tweets
function saveTweets(tweets, email, username) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO tweets (tweet_id, username, email, content, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        let savedCount = 0;
        tweets.forEach(tweet => {
            stmt.run([
                tweet.id,
                username,
                email,
                tweet.fullText,
                tweet.createdAt
            ], function(err) {
                if (err) {
                    console.error('Error saving tweet:', err);
                } else if (this.changes > 0) {
                    savedCount++;
                }
            });
        });

        stmt.finalize(err => {
            if (err) {
                reject(err);
            } else {
                resolve(savedCount);
            }
        });
    });
}

// Get all subscriptions
function getSubscriptions() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM subscriptions ORDER BY created_at DESC', (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Get all tweets
function getTweets() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM tweets ORDER BY created_at DESC', (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Get tweets for a specific subscription
function getTweetsForSubscription(email, username) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM tweets WHERE email = ? AND username = ? ORDER BY created_at DESC',
            [email, username],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Get handles associated with an email
function getHandlesByEmail(email) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT username FROM subscriptions WHERE email = ?',
            [email],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => row.username));
                }
            }
        );
    });
}

module.exports = {
    addSubscription,
    saveTweets,
    getSubscriptions,
    getTweets,
    getTweetsForSubscription,
    getHandlesByEmail
};
