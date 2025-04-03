import process from "node:process";
const { Rettiwt } = require('rettiwt-api');
const { Resend } = require('resend');
const OpenAI = require('openai');
const db = require("./database.js");
const http = require('http');
const url = require('url');

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Rettiwt with API key
const rettiwt = new Rettiwt({ apiKey: process.env.RETTIWT_API_KEY });

// Function to send daily newsletter
async function sendDailyNewsletter() {
    try {
        console.log('Starting daily newsletter process at', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        
        // Get all active subscriptions
        const subscriptions = await db.getSubscriptions();
        
        if (subscriptions.length === 0) {
            console.log('No active subscriptions found');
            return;
        }

        // Group subscriptions by email
        const groupedSubscriptions = {};
        subscriptions.forEach(sub => {
            if (!groupedSubscriptions[sub.email]) {
                groupedSubscriptions[sub.email] = [];
            }
            groupedSubscriptions[sub.email].push(sub.handle);
        });

        // Process each email's subscriptions
        for (const [email, handles] of Object.entries(groupedSubscriptions)) {
            console.log(`Processing newsletter for ${email} with handles: ${handles.join(', ')}`);

            // Fetch tweets for all handles
            const tweets = await fetchRecentTweetsForHandles(handles);
            console.log(`Found ${tweets.length} tweets for ${email}`);

            // Summarize tweets
            const summary = await summarizeTweets(tweets);

            // Send email
            const emailContent = `
                <html>
                    <body style="font-family: Arial, sans-serif;">
                        <h1 style="color: #1DA1F2; text-align: center;">ByteSized News</h1>
                        <p style="text-align: center; color: #657786;">Your Daily Twitter Digest</p>
                        
                        <div style="max-width: 800px; margin: 0 auto;">
                            ${summary}
                        </div>
                    </body>
                </html>
            `;

            const emailData = {
                from: 'ByteSize <hello@autodm.in>',
                to: email,
                subject: 'Your Daily Twitter Digest',
                html: emailContent
            };

            // const response = await resend.emails.send(emailData);
            await resend.emails.send(emailData);
            console.log(`Newsletter sent to ${email} at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
        }
    } catch (error) {
        console.error('Error in daily newsletter:', error);
        throw error;
    }
}

// Function to fetch tweets from last 24 hours
async function fetchRecentTweetsForHandles(handles) {
    try {
        const allTweets = [];
        
        for (const handle of handles) {
            console.log(`Fetching tweets for handle: @${handle}`);
            const tweets = await rettiwt.tweet.search({
                fromUsers: [handle],
                words: [],
                limit: 100
            });
            allTweets.push(...tweets.list);
            console.log(`Found ${tweets.list.length} tweets for @${handle}`);
        }

        return allTweets;
    } catch (error) {
        console.error('Error fetching tweets:', error);
        throw error;
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

        let summary = '<div style="margin-bottom: 20px;">';

        // Generate summary for each user
        for (const [username, userTweets] of Object.entries(groupedTweets)) {
            const tweetTexts = userTweets.map(tweet => tweet.fullText).join('\n\n');

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                      role: "system",
                      content: `You are an assistant that summarizes tweets from a Twitter user and formats them into modern, clean HTML suitable for embedding in an email newsletter. 
                      Generate a concise summary of the tweets, focusing on key points and context. Format the output as HTML with proper styling for readability.
                      Include a brief introduction for each user and their tweets.
                      Use modern HTML/CSS for styling and ensure the output is clean and professional.`
                    },
                    {
                      role: "user",
                      content: `User: @${username}\nTweets:\n${tweetTexts}`
                    }
                ],
                temperature: 0.7
            });

            const userSummary = completion.choices[0].message.content;
            summary += `<div style="border: 1px solid #e1e8ed; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #f5f8fa;">`;
            summary += `<h2 style="color: #1DA1F2; margin: 0 0 10px 0;">@${username}</h2>`;
            summary += userSummary;
            summary += '</div>';
        }

        summary += '</div>';
        return summary;
    } catch (error) {
        console.error('Error summarizing tweets:', error);
        throw error;
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/api/newsletter') {
        try {
            await sendDailyNewsletter();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Newsletter sent successfully' }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Cron server running at http://localhost:${PORT}`);
});

module.exports = {
    sendDailyNewsletter
};
