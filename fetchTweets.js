require('dotenv').config();
const { Rettiwt } = require('rettiwt-api');
const { Resend } = require('resend');
const OpenAI = require('openai');
const http = require('http');
const fs = require('fs');
const url = require('url');
const db = require('./database');

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Rettiwt with API key
const rettiwt = new Rettiwt({ apiKey: process.env.RETTIWT_API_KEY });

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

// Function to send tweets via email
async function sendTweetsByEmail(email, username, tweets) {
    try {
        // Get summary of tweets
        const summary = await summarizeTweets(tweets);
        console.log('Successfully created summary for tweets');

        const emailContent = `Summary of tweets from @${username}:

${summary}`;
        console.log('Email content prepared');

        console.log('Sending email to:', email);
        const response = await resend.emails.send({
            from: 'ByteSize <onboarding@resend.dev>',
            to: email,
            subject: `Summary of tweets from @${username}`,
            text: emailContent
        });
        
        console.log('Email response:', response);
        console.log(`Email sent successfully to ${email}`);
    } catch (error) {
        console.error('Error sending email:', {
            error: error.message,
            stack: error.stack,
            email,
            username
        });
        throw error;
    }
}

// Function to fetch handles associated with an email
async function getHandlesForEmail(email) {
    try {
        console.log(`Fetching handles for email: ${email}`);
        const handles = await db.getHandlesByEmail(email);
        console.log(`Found ${handles.length} handles for email: ${email}`);
        return handles;
    } catch (error) {
        console.error('Error fetching handles:', error);
        throw error;
    }
}

// Function to fetch recent tweets from multiple handles
async function fetchRecentTweetsForHandles(handles, email) {
    try {
        console.log(`Fetching tweets for ${handles.length} handles`);
        const allTweets = [];

        for (const handle of handles) {
            console.log(`Fetching tweets for handle: @${handle}`);
            const tweets = await rettiwt.tweet.search({
                fromUsers: [handle],
                words: [],
                limit: 100
            });

            const originalTweets = tweets.list.filter(tweet => !tweet.replyTo);
            console.log(`Found ${originalTweets.length} original tweets for @${handle}`);
            allTweets.push(...originalTweets);

            // Save subscription and tweets to database
            try {
                await db.addSubscription(email, handle);
                const savedCount = await db.saveTweets(originalTweets, email, handle);
                console.log(`Saved ${savedCount} new tweets to database for @${handle}`);
            } catch (dbError) {
                console.error('Database error:', dbError);
            }
        }

        if (allTweets.length === 0) {
            return 'No original tweets found for any of the handles.';
        }

        // Send tweets via email
        await sendTweetsByEmail(email, handles.join(', '), allTweets);

        // Format output
        let output = `Successfully subscribed ${email} to tweets from ${handles.length} handles\n\n`;
        output += `Original Tweets:\n\n`;
        
        allTweets.forEach(tweet => {
            console.log('Full tweet object:', JSON.stringify(tweet, null, 2));
            const date = new Date(tweet.createdAt);
            const formattedDate = date.toLocaleString();
            output += `[@${tweet.tweetBy.userName}] [${formattedDate}]\n${tweet.fullText}\n\n`;
        });
        
        output += `Total original tweets found: ${allTweets.length}`;
        return output;
    } catch (error) {
        return `Error fetching tweets: ${error.message}`;
    }
}

// Export the function for use in other modules
module.exports = {
    fetchRecentTweetsForHandles
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/') {
        // Serve the main HTML file
        fs.readFile('index.html', (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } else if (parsedUrl.pathname === '/view') {
        // Serve the database viewer HTML file
        fs.readFile('viewSubscriptions.html', (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading viewSubscriptions.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } else if (parsedUrl.pathname === '/subscriptions') {
        // Return all subscriptions as JSON
        try {
            const subscriptions = await db.getSubscriptions();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(subscriptions));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    } else if (parsedUrl.pathname === '/stored-tweets') {
        // Return all tweets as JSON
        try {
            const tweets = await db.getTweets();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tweets));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    } else if (parsedUrl.pathname === '/fetch-tweets') {
        if (req.method === 'POST') {
            // Handle POST request with JSON data
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', async () => {
                try {
                    const { email, username } = JSON.parse(body);
                    if (!email || !username) {
                        res.writeHead(400);
                        res.end('Email and username are required');
                        return;
                    }

                    // Get all handles for the email
                    const handles = await getHandlesForEmail(email);
                    handles.push(username); // Add the new handle

                    const result = await fetchRecentTweetsForHandles(handles, email);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(result);
                } catch (error) {
                    res.writeHead(500);
                    res.end(`Error: ${error.message}`);
                }
            });
        } else {
            res.writeHead(405);
            res.end('Method not allowed');
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