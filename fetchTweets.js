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
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: `You are a helpful assistant that summarizes tweets from @${username}. Provide a concise summary of the main points in bullet points, including important details and context.`
                    },
                    {
                        role: "user",
                        content: `Summarize these tweets from @${username} in concise bullet points, focusing on the main points and important details: ${tweetTexts}`
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

            const originalTweets = tweets.list.filter(tweet => !tweet.replyTo);
            console.log(`Found ${originalTweets.length} original tweets for @${handle}`);
            allTweets.push(...originalTweets);
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
                    text: summary
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

// Function to subscribe email to handles
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
}

// Schedule daily newsletter at 5:28 PM IST
cron.schedule('28 17 * * *', () => {
    sendDailyNewsletter();
}, {
    timezone: 'Asia/Kolkata'
});

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