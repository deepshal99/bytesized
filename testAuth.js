const { Rettiwt } = require('rettiwt-api');
const { fetchRecentTweets } = require('./fetchTweets');

// Initialize Rettiwt with API key
const rettiwt = new Rettiwt({ apiKey: 'a2R0PUhTOGxWQWpZbUxxQmtBSzU4UXN1cm1RRGRLZlFDbWlsa09zYm11NDM7YXV0aF90b2tlbj05YzMyYTRlMjI4OTU5YThhYTM3YTEwZWRmOTQzYWJmNDFkNjRiYTI1O2N0MD01ZjE2MjdiM2YyMDY1YmJiOGU4ZGEzNjQxYTNlZTFhMDVjMmVhMjMzNzU2MGViMDgzNDk3NjM3ZjRjZjJiYTk4OGI5NTg1OTdjMDdkMGNiOGE5YjUwYjUzY2M3NDMxYTFmMzU3Njk5YzI2MjY0MWU4MjcyNjViMDliYjhkYjFiYTU0N2JmYjFiYWY4OTZlNWMxM2MwYzk3ZmZkZmZkZDljO3R3aWQ9dSUzRDE5MDA5NDY2MjYzOTY3NzQ0MDA7' });

// Test fetching tweets and sending email
async function testEmailFunctionality() {
    try {
        // Use a real email address for testing
        const result = await fetchRecentTweets('elonmusk', 'deepshal99@gmail.com');
        console.log('Success:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

testEmailFunctionality();
