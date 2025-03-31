require('dotenv').config();
const { Rettiwt } = require('rettiwt-api');
const { Resend } = require('resend');
const OpenAI = require('openai');
const http = require('http');
const fs = require('fs');
const url = require('url');
const db = require('./database');
const cron = require('node-cron');


// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Rettiwt with API key
const rettiwt = new Rettiwt({ apiKey: process.env.RETTIWT_API_KEY });

// Function to get current time in IST
function getCurrentIST() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
}

// Function to generate newspaper-like image with tweet summaries
async function generateNewsImage(tweets, email) {
    try {
        if (tweets.length === 0) {
            console.log('No tweets to generate image for');
            return null;
        }

        // Group tweets by username
        const groupedTweets = {};
        tweets.forEach(tweet => {
            const username = tweet.tweetBy.userName;
            if (!groupedTweets[username]) {
                groupedTweets[username] = [];
            }
            groupedTweets[username].push(tweet);
        });

        // Create a concise summary for the image prompt
        let summaryText = 'Headlines:\n';
        
        // Add up to 3 usernames and their tweet counts
        const usernames = Object.keys(groupedTweets).slice(0, 3);
        usernames.forEach(username => {
            const tweetCount = groupedTweets[username].length;
            summaryText += `- ${tweetCount} new tweets from @${username}\n`;
        });

        if (Object.keys(groupedTweets).length > 3) {
            summaryText += `- And more from ${Object.keys(groupedTweets).length - 3} other accounts\n`;
        }

        // Current date for the newspaper
        const currentDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Create the prompt for DALL-E
        const prompt = `Create a realistic newspaper front page titled "ByteSized News" for ${currentDate}. 
        Include a personalized headline: "Your Daily Twitter Digest" and subtitle "Curated for ${email}".
        The newspaper should have a clean, modern layout with ${summaryText} formatted as news headlines.
        Include a small Twitter/X logo in the masthead. Style should be professional and newspaper-like with columns.`;

        // Generate the image using DALL-E
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
        });

        console.log('News image generated successfully');
        return response.data[0].url;
    } catch (error) {
        console.error('Error generating news image:', error);
        return null;
    }
}

// Function to summarize tweets using OpenAI
async function summarizeTweets(tweets) {
    try {
        // Group tweets by username
        const groupedTweets = {};
        tweets.forEach(tweet => {
            const username = tweet.tweetBy.userName;
            if (!groupedTweets[username]) {
                groupedTweets[username] = [];
            }
            groupedTweets[username].push(tweet);
        });

        let summary = 'Your daily personalized newsletter\n\n';

        // Generate summary for each user
        for (const [username, userTweets] of Object.entries(groupedTweets)) {
            const tweetTexts = userTweets.map(tweet => tweet.fullText).join('\n\n');

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                      role: "system",
                      content: `You are an assistant that summarizes tweets from a Twitter user and formats them into modern, clean HTML suitable for embedding in an email newsletter. 
                  
                  Follow this structure strictly:
                  - Do NOT include <html>, <head>, or <body> tags.
                  - Wrap each summary in a <div> block with:
                    - white background
                    - light border
                    - border-radius
                    - padding and subtle shadow
                  - Use an <h2> tag for the Twitter handle header with an emoji (📢).
                  - Use <ul> with <li> for bullet points.
                  - Use <strong> to highlight key phrases or ideas.
                  - If applicable, include links using <a> tags with a blue color.
                  - Return only the single block for one Twitter handle—do not combine multiple handles or return plain text.`
                    },
                    {
                      role: "user",
                      content: `Summarize tweets from @${username} into a structured HTML block suitable for embedding in a modern email newsletter. Follow the style and structure exactly as described above. Use concise bullet points with <strong> emphasis, and wrap the entire summary in a styled <div>.\n\nTweets:\n${tweetTexts}`
                    }
                  ],
                  
                  
                  
                temperature: 0.7,
                max_tokens: 300
            });

            summary += `Updates from @${username}\n`;
            summary += completion.choices[0].message.content + '\n\n';
        }

        return summary;
    } catch (error) {
        console.error('Error summarizing tweets:', error);
        throw error;
    }
}

// Function to fetch tweets from last 24 hours
/*
async function fetchRecentTweetsForHandles(handles) {
    try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        console.log(`Fetching tweets for ${handles.length} handles`);
        const allTweets = [];

        for (const handle of handles) {
            console.log(`Fetching tweets for handle: @${handle}`);
            const tweets = await rettiwt.tweet.search({
                fromUsers: [handle],
                words: [],
                since: twentyFourHoursAgo,
                until: now,
                limit: 100
            });

            //const originalTweets = tweets.list.filter(tweet => !tweet.replyTo);
            console.log(`Found ${tweets.list.length} tweets for @${handle}`);
            allTweets.push(...tweets.list);
        }

        return allTweets;
    } catch (error) {
        console.error('Error fetching tweets:', error);
        throw error;
    }
} */
    async function fetchRecentTweetsForHandles(handles) {
        try {
            console.log(`Fetching tweets for ${handles.length} handles`);
            const allTweets = [];
    
            // Helper function to segregate tweets into main tweets and replies
            function segregateTweet(tweets) {
                const categorizedTweets = {
                    mainTweets: [],
                    replies: []
                };
    
                tweets.forEach(tweet => {
                    if (tweet.replyTo === undefined) {
                        // Categorize as main tweet
                        categorizedTweets.mainTweets.push(tweet);
                    } else {
                        // Categorize as reply
                        categorizedTweets.replies.push(tweet);
                    }
                });
    
                return categorizedTweets;
            }
    
            // Helper function to filter tweets within the last n hours
            function filterTweetsWithinHours(tweets, n) {
                const currentTime = new Date(); // Current time in UTC (by default)
                
                // Filter the tweets
                const filteredTweets = tweets.filter(tweet => {
                    const tweetTime = new Date(tweet.createdAt); // createdAt is already in UTC format
                    const timeDifference = (currentTime - tweetTime) / (1000 * 60 * 60); // Difference in hours
                    return timeDifference <= n;
                });
                
                return filteredTweets;
            }
    
            for (const handle of handles) {
                console.log(`Fetching tweets for handle: @${handle}`);
                try {
                    // Fetch tweets for the handle
                    const response = await rettiwt.tweet.search({ 
                        fromUsers: [handle]
                    }, 20); // Limit to 20 tweets
                    
                    console.log(`Found ${response.list.length} total tweets for @${handle}`);
                    
                    // Categorize tweets into main tweets and replies
                    const categorizedTweets = segregateTweet(response.list);
                    console.log(`Found ${categorizedTweets.mainTweets.length} main tweets for @${handle}`);
                    
                    // Filter main tweets from the last 24 hours
                    const recentMainTweets = filterTweetsWithinHours(categorizedTweets.mainTweets, 24);
                    console.log(`Found ${recentMainTweets.length} main tweets from the last 24 hours for @${handle}`);
                    
                    // Add the recent main tweets to our collection
                    allTweets.push(...recentMainTweets);
                } catch (handleError) {
                    console.error(`Error fetching tweets for @${handle}:`, handleError);
                    // Continue with other handles instead of failing completely
                }
            }
    
            return allTweets;
        } catch (error) {
            console.error('Error fetching tweets:', error);
            throw error;
        }
    }
// Function to send daily newsletter

async function sendDailyNewsletter() {
    try {
        console.log(`[${getCurrentIST()}] Starting daily newsletter process`);

        // Get all unique emails
        const subscriptions = await db.getSubscriptions();
        const emails = [...new Set(subscriptions.map(sub => sub.email))];

        for (const email of emails) {
            try {
                console.log(`Processing email: ${email}`);
                const handles = await db.getHandlesByEmail(email);
                if (handles.length === 0) continue;

                const tweets = await fetchRecentTweetsForHandles(handles);
                if (tweets.length === 0) {
                    console.log(`No new tweets found for ${email}`);
                    continue;
                }

                const summary = await summarizeTweets(tweets);
                const emailContent = {
                    from: 'ByteSize <onboarding@resend.dev>',
                    to: email,
                    subject: 'Your Daily Twitter Newsletter',
                    html: summary
                };

                const response = await resend.emails.send(emailContent);
                console.log(`Newsletter sent to ${email} with response: ${JSON.stringify(response)}`);
            } catch (error) {
                console.error(`Error processing email ${email}:`, error);
            }
        }

        console.log(`[${getCurrentIST()}] Daily newsletter process completed`);
    } catch (error) {
        console.error('Error in daily newsletter process:', error);
    }
} 
// Update the sendDailyNewsletter function to include the image

/*
async function sendDailyNewsletter() {
    try {
        console.log(`[${getCurrentIST()}] Starting daily newsletter process`);
        
        // Get all active subscriptions
        const subscriptions = await db.getSubscriptions();
        
        // Group subscriptions by email
        const emailToHandles = {};
        subscriptions.forEach(sub => {
            if (!emailToHandles[sub.email]) {
                emailToHandles[sub.email] = [];
            }
            emailToHandles[sub.email].push(sub.handle);
        });
        
        // Process each email
        for (const [email, handles] of Object.entries(emailToHandles)) {
            console.log(`Processing email: ${email}`);
            
            // Fetch tweets for all handles
            const tweets = await fetchRecentTweetsForHandles(handles);
            
            if (tweets.length > 0) {
                // Generate summary
                const summary = await summarizeTweets(tweets);
                
                // Generate newspaper image
                const imageUrl = await generateNewsImage(tweets, email);
                
                // Prepare email content
                let htmlContent = `<h1>Your Daily Twitter Digest</h1>
                                  <p>Here's what's happening from the accounts you follow:</p>
                                  <pre>${summary}</pre>`;
                
                // Add the image if available
                if (imageUrl) {
                    htmlContent = `<img src="${imageUrl}" alt="Your Daily News" style="width: 100%; max-width: 600px; margin-bottom: 20px;" />
                                  ${htmlContent}`;
                }
                
                // Send email
                const emailResponse = await resend.emails.send({
                    from: 'ByteSize <onboarding@resend.dev>',
                    to: email,
                    subject: 'Your Daily Twitter Digest',
                    html: htmlContent
                });
                
                console.log(`Newsletter sent to ${email} with response:`, emailResponse);
            } else {
                console.log(`No new tweets found for ${email}`);
            }
        }
        
        console.log(`[${getCurrentIST()}] Daily newsletter process completed`);
    } catch (error) {
        console.error('Error sending newsletter:', error);
    }
}
*/

// Function to subscribe email to handles
/*
async function subscribeEmailToHandles(email, handle) {
    try {
        // Add subscription to database
        await db.addSubscription(email, handle);

        // Send confirmation email
        const confirmationEmail = {
            from: 'ByteSize <onboarding@resend.dev>',
            to: email,
            subject: 'Subscription Confirmation',
            text: `You are now subscribed to @${handle}.

You will receive your daily newsletter at 5:28 PM IST.`
        };

        const response = await resend.emails.send(confirmationEmail);
        console.log('Confirmation email response:', response);

        return `Successfully subscribed ${email} to @${handle}. Check your inbox for confirmation!`;
    } catch (error) {
        console.error('Subscription error:', error);
        throw error;
    }
}*/
async function subscribeEmailToHandles(email, handles) {
    try {
        // Ensure handles is an array
        if (!Array.isArray(handles)) {
            handles = [handles];
        }

        const dbInstance = db.getDb();

        // Promisify the run method
        const runAsync = (sql, params) => {
            return new Promise((resolve, reject) => {
                dbInstance.run(sql, params, function(err) {
                    if (err) return reject(err);
                    resolve(this);
                });
            });
        };

        // Promisify the get method
        const getAsync = (sql, params) => {
            return new Promise((resolve, reject) => {
                dbInstance.get(sql, params, (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
        };

        // Insert or update user
        await runAsync('INSERT OR IGNORE INTO users (email) VALUES (?)', [email]);

        // Get user ID
        const user = await getAsync('SELECT id FROM users WHERE email = ?', [email]);

        if (!user || !user.id) {
            throw new Error(`Failed to retrieve user ID for email: ${email}`);
        }

        // Insert subscriptions for each handle
        for (const handle of handles) {
            await runAsync(`
                INSERT INTO subscriptions (user_id, handle)
                VALUES (?, ?)
                ON CONFLICT(user_id, handle) DO UPDATE SET is_active = 1
            `, [user.id, handle]);
        }

        // Send confirmation email
        const confirmationEmail = {
            from: 'ByteSize <onboarding@resend.dev>',
            to: email,
            subject: 'Subscription Confirmation',
            html: `<p>You have successfully subscribed to ${handles.join(', ')} on Bytesized News.</p>`
        };

        const response = await resend.emails.send(confirmationEmail);
        console.log('Confirmation email response:', response);

        return `Successfully subscribed ${email} to ${handles.join(', ')}. Check your inbox for confirmation!`;
    } catch (error) {
        console.error('Subscription error:', error);
        throw error;
    }
}

// Schedule daily newsletter at 5:28 PM IST
/*cron.schedule('28 17 * * *', () => {
    sendDailyNewsletter();
}, {
    timezone: 'Asia/Kolkata'
});*/
// Helper function to convert HH:MM to cron expression
function scheduleDailyAt(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return cron.schedule(`${minutes} ${hours} * * *`, () => {
        sendDailyNewsletter();
    }, {
        timezone: 'Asia/Kolkata'
    });
}

// Schedule daily newsletter at specified time (HH:MM in 24-hour format)
scheduleDailyAt('14:49');

console.log('Daily newsletter scheduled to run at 5:28 PM IST');

// Export the function for use in other modules
module.exports = {
    fetchRecentTweetsForHandles
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/subscribe' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { email, handle } = JSON.parse(body);
                const result = await subscribeEmailToHandles(email, handle);
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ message: result }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else if (parsedUrl.pathname === '/') {
        // Serve the main HTML file
        fs.readFile('index.html', (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading page');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
                res.end(content);
            }
        });
    } else if (parsedUrl.pathname === '/view') {
        // View database contents
        try {
            const subscriptions = await db.getSubscriptions();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(subscriptions, null, 2));
        } catch (error) {
            res.writeHead(500);
            res.end('Error fetching database');
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Start server
const port = 3000;
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`View database at http://localhost:${port}/view`);
});