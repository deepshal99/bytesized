const { Rettiwt } = require('rettiwt-api');
const { Resend } = require('resend');
const OpenAI = require('openai');
const http = require('http');
const fs = require('fs');
const url = require('url');
const db = require('./database');

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: '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'
});

// Initialize Resend with your API key
const resend = new Resend('re_775Gtu4v_HeNTJxs22BZnrC678CxYavRg');

// Initialize Rettiwt with API key
const rettiwt = new Rettiwt({ apiKey: 'a2R0PUhTOGxWQWpZbUxxQmtBSzU4UXN1cm1RRGRLZlFDbWlsa09zYm11NDM7YXV0aF90b2tlbj05YzMyYTRlMjI4OTU5YThhYTM3YTEwZWRmOTQzYWJmNDFkNjRiYTI1O2N0MD01ZjE2MjdiM2YyMDY1YmJiOGU4ZGEzNjQxYTNlZTFhMDVjMmVhMjMzNzU2MGViMDgzNDk3NjM3ZjRjZjJiYTk4OGI5NTg1OTdjMDdkMGNiOGE5YjUwYjUzY2M3NDMxYTFmMzU3Njk5YzI2MjY0MWU4MjcyNjViMDliYjhkYjFiYTU0N2JmYjFiYWY4OTZlNWMxM2MwYzk3ZmZkZmZkZDljO3R3aWQ9dSUzRDE5MDA5NDY2MjYzOTY3NzQ0MDA7' });

// Function to summarize tweets using OpenAI
async function summarizeTweets(tweets) {
    try {
        const tweetTexts = tweets.map(tweet => tweet.fullText).join('\n\n');
        
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that summarizes tweets. Provide a concise summary of the main points without any additional commentary or analysis."
                },
                {
                    role: "user",
                    content: `Summarize these tweets in a concise way, focusing on the main points without any additional commentary: ${tweetTexts}`
                }
            ],
            temperature: 0.7,
            max_tokens: 200
        });

        return completion.choices[0].message.content;
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

// Function to fetch recent tweets from a specific user
async function fetchRecentTweets(username, email) {
    try {
        const tweets = await rettiwt.tweet.search({
            fromUsers: [username],
            words: [],
            limit: 100
        });

        const originalTweets = tweets.list.filter(tweet => !tweet.replyTo);

        if (originalTweets.length === 0) {
            return 'No original tweets found in the recent timeline.';
        }

        // Send tweets via email
        await sendTweetsByEmail(email, username, originalTweets);

        // Save subscription and tweets to database
        try {
            await db.addSubscription(email, username);
            const savedCount = await db.saveTweets(originalTweets, email, username);
            console.log(`Saved ${savedCount} new tweets to database`);
        } catch (dbError) {
            console.error('Database error:', dbError);
        }

        // Format output
        let output = `Successfully subscribed ${email} to tweets from @${username}\n\n`;
        output += `Original Tweets by @${username}:\n\n`;
        
        originalTweets.forEach(tweet => {
            const date = new Date(tweet.createdAt);
            const formattedDate = date.toLocaleString();
            output += `[${formattedDate}]\n${tweet.fullText}\n\n`;
        });
        
        output += `Total original tweets found: ${originalTweets.length}`;
        return output;
    } catch (error) {
        return `Error fetching tweets: ${error.message}`;
    }
}

// Export the function for use in other modules
module.exports = {
    fetchRecentTweets
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

                    const result = await fetchRecentTweets(username, email);
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