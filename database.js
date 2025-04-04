const { MongoClient } = require('mongodb');

// Connection URI - use environment variable
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/newsletter';
const dbName = 'newsletter';

// Create a new MongoClient
const client = new MongoClient(uri);
let db;

// Connect to the MongoDB server
async function connectToDatabase() {
  if (db) return db;
  
  try {
    await client.connect();
    console.log('Connected to MongoDB server');
    db = client.db(dbName);
    
    // Create indexes for better performance
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('subscriptions').createIndex({ user_id: 1, handle: 1 });
    await db.collection('tweets').createIndex({ tweet_id: 1 }, { unique: true });
    
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

// Helper functions
const getDb = async () => {
  return await connectToDatabase();
};

// Get handles by email
const getHandlesByEmail = async (email) => {
  try {
    const database = await connectToDatabase();
    const user = await database.collection('users').findOne({ email });
    
    if (!user) return [];
    
    const subscriptions = await database.collection('subscriptions').find({
      user_id: user._id,
      is_active: true
    }).toArray();
    
    return subscriptions.map(sub => sub.handle);
  } catch (error) {
    console.error('Error getting handles by email:', error);
    throw error;
  }
};

// Add subscription
const addSubscription = async (email, handle) => {
  // Convert single handle to array if necessary
  const handles = Array.isArray(handle) ? handle : [handle];
  
  try {
    const database = await connectToDatabase();
    
    // First get or create the user
    let user = await database.collection('users').findOne({ email });
    
    if (!user) {
      // User doesn't exist, create new user
      const result = await database.collection('users').insertOne({
        email,
        preferences: '',
        created_at: new Date(),
        last_active: new Date()
      });
      
      user = {
        _id: result.insertedId,
        email
      };
    }
    
    // Process each handle
    for (const h of handles) {
      // Check if subscription already exists
      const existingSubscription = await database.collection('subscriptions').findOne({
        user_id: user._id,
        handle: h
      });
      
      if (existingSubscription) {
        // Subscription exists, update it to active
        await database.collection('subscriptions').updateOne(
          { _id: existingSubscription._id },
          { $set: { is_active: true } }
        );
      } else {
        // Create new subscription
        await database.collection('subscriptions').insertOne({
          user_id: user._id,
          handle: h,
          is_active: true
        });
      }
    }
    
    return user._id;
  } catch (error) {
    console.error('Error adding subscription:', error);
    throw error;
  }
};

// Save tweets
const saveTweets = async (tweets, email, handle) => {
  try {
    const database = await connectToDatabase();
    
    const operations = tweets.map(tweet => {
      return {
        updateOne: {
          filter: { tweet_id: tweet.id },
          update: {
            $setOnInsert: {
              tweet_id: tweet.id,
              handle: handle,
              content: JSON.stringify(tweet),
              processed: false,
              created_at: new Date()
            }
          },
          upsert: true
        }
      };
    });
    
    if (operations.length > 0) {
      const result = await database.collection('tweets').bulkWrite(operations);
      return result.upsertedCount || tweets.length; // Return count of inserted tweets
    }
    
    return 0;
  } catch (error) {
    console.error('Error saving tweets:', error);
    throw error;
  }
};

// Get subscriptions
const getSubscriptions = async () => {
  try {
    const database = await connectToDatabase();
    
    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $match: { is_active: true } },
      {
        $project: {
          _id: 0,
          email: '$user.email',
          handle: 1
        }
      }
    ];
    
    return await database.collection('subscriptions').aggregate(pipeline).toArray();
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    throw error;
  }
};

module.exports = {
    getDb,
    getHandlesByEmail,
    addSubscription,
    saveTweets,
    getSubscriptions,
};
