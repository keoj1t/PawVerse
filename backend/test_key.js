const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

async function test() {
    try {
        console.log('Testing OpenAI key...');
        if (!process.env.OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY is not set');
            return;
        }
        const models = await openai.models.list();
        console.log('✅ Key is valid. Models found:', models.data.length);
    } catch (err) {
        console.error('❌ OpenAI Key Error:', err.message);
    }
}
test();
