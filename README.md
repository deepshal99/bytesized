# ByteSize - Twitter Summary App

ByteSize is an application that fetches tweets from Twitter, summarizes them using OpenAI's GPT-3.5, and sends email summaries to users.

## Features

- Fetch tweets from any Twitter user
- Automatically summarize tweets using GPT-3.5
- Send email summaries with "ByteSize" as the sender name
- Save tweets to a local database

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your API keys:
```
TWITTER_API_KEY=your_twitter_api_key
OPENAI_API_KEY=your_openai_api_key
RESEND_API_KEY=your_resend_api_key
```

3. Start the server:
```bash
node fetchTweets.js
```

## API Keys

- Twitter API key for fetching tweets
- OpenAI API key for tweet summarization
- Resend API key for sending emails

## Usage

The server runs on `http://localhost:3000` and provides endpoints for:
- Fetching tweets
- Viewing database contents
- Sending email summaries
