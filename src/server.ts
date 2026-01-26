
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { handleWebhook } from './controllers/webhookController';
import { handleNewLead, handleQuizLead } from './controllers/leadController';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Log every request
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

// Health Check
app.get('/health', (req, res) => {
    res.status(200).send('XPACE WhatsApp Bot is running (Refactored)!');
});

// ----------------------------------------------------------------------
// ROUTES
// ----------------------------------------------------------------------

// Main Webhook (Evolution API)
app.post('/webhook', handleWebhook);

// Internal API (Site Integration)
app.post('/api/lead', handleNewLead);
app.post('/api/quiz', handleQuizLead);


// Start Server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

export default app;
