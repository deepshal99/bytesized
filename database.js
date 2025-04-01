const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./newsletter.db');

// Initialize database with improved schema
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        preferences TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Subscriptions table
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        handle TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    db.run('PRAGMA foreign_keys = ON;');

    // Tweets table
    db.run(`CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id TEXT UNIQUE NOT NULL,
        handle TEXT NOT NULL,
        content TEXT NOT NULL,
        processed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(handle) REFERENCES subscriptions(handle)
    )`);
});

// Helper functions
const getDb = () => db;

// Get handles by email
const getHandlesByEmail = (email) => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT s.handle FROM subscriptions s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ? AND s.is_active = 1`,
            [email],
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows.map(row => row.handle));
            }
        );
    });
};

// Add subscription
const addSubscription = (email, handle) => {
    // Convert single handle to array if necessary
    const handles = Array.isArray(handle) ? handle : [handle];
    
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // First get or create the user
            db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
                if (err) return reject(err);

                let userId;
                if (!user) {
                    // User doesn't exist, create new user
                    db.run(
                        `INSERT INTO users (email) VALUES (?)`,
                        [email],
                        function(err) {
                            if (err) return reject(err);
                            userId = this.lastID;
                            proceedWithSubscriptions();
                        }
                    );
                } else {
                    userId = user.id;
                    proceedWithSubscriptions();
                }

                function proceedWithSubscriptions() {
                    const promises = handles.map(h => {
                        return new Promise((resolve, reject) => {
                            // Check if subscription already exists
                            db.get(
                                `SELECT id FROM subscriptions WHERE user_id = ? AND handle = ?`,
                                [userId, h],
                                (err, existingSubscription) => {
                                    if (err) return reject(err);

                                    if (existingSubscription) {
                                        // Subscription exists, update it to active
                                        db.run(
                                            `UPDATE subscriptions SET is_active = 1 WHERE id = ?`,
                                            [existingSubscription.id],
                                            function(err) {
                                                if (err) return reject(err);
                                                resolve(existingSubscription.id);
                                            }
                                        );
                                    } else {
                                        // Create new subscription
                                        db.run(
                                            `INSERT INTO subscriptions (user_id, handle, is_active) VALUES (?, ?, 1)`,
                                            [userId, h],
                                            function(err) {
                                                if (err) return reject(err);
                                                resolve(this.lastID);
                                            }
                                        );
                                    }
                                }
                            );
                        });
                    });

                    Promise.all(promises)
                        .then(() => resolve(userId))
                        .catch(reject);
                }
            });
        });
    });
};

// Save tweets
const saveTweets = (tweets, email, handle) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare(
                `INSERT OR IGNORE INTO tweets (tweet_id, handle, content)
                VALUES (?, ?, ?)`
            );

            tweets.forEach(tweet => {
                stmt.run(tweet.id, handle, JSON.stringify(tweet));
            });

            stmt.finalize(err => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                db.run('COMMIT', err => {
                    if (err) return reject(err);
                    resolve(tweets.length);
                });
            });
        });
    });
};

// Get subscriptions
const getSubscriptions = () => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT u.email, s.handle FROM subscriptions s
            JOIN users u ON s.user_id = u.id
            WHERE s.is_active = 1`,
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            }
        );
    });
};

module.exports = {
    getDb,
    getHandlesByEmail,
    addSubscription,
    saveTweets,
    getSubscriptions,
};
