import OpenAI from 'openai';

// Function to get API key (simplified)
function getApiKey(provider) {
  if (provider === 'groq') {
    return process.env.GROQ_API_KEY;
  }
  return null;
}

async function testGroqConnection() {
  console.log('Testing Groq connection...');
  
  const groqApiKey = getApiKey('groq');
  if (!groqApiKey) {
    console.log('❌ GROQ_API_KEY not found in environment variables');
    console.log('Available environment variables:');
    Object.keys(process.env).filter(key => key.includes('GROQ') || key.includes('API')).forEach(key => {
      console.log(`- ${key}: ${process.env[key] ? '✓ Set' : '✗ Not set'}`);
    });
    return;
  }
  
  console.log('✅ GROQ_API_KEY found');
  
  try {
    const groqClient = new OpenAI({
      apiKey: groqApiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });
    
    console.log('Testing Groq API connection...');
    
    const response = await groqClient.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Hello, please respond with just "Connection successful"' }],
      max_tokens: 10
    });
    
    const content = response.choices[0]?.message?.content;
    console.log('✅ Groq API Response:', content);
    
    // Test the insight extraction prompt format
    console.log('\nTesting insight extraction...');
    const insightResponse = await groqClient.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { 
          role: 'system', 
          content: 'You are a context insight extractor. Extract insights and respond with JSON format: {"insights": [], "confidence": 0.5}' 
        },
        { 
          role: 'user', 
          content: 'Extract insights from: "Please help me fix authentication errors in my Node.js app"' 
        }
      ],
      temperature: 0.1,
      max_tokens: 200
    });
    
    const insightContent = insightResponse.choices[0]?.message?.content;
    console.log('✅ Insight extraction response:', insightContent);
    
    try {
      const parsed = JSON.parse(insightContent);
      console.log('✅ JSON parsing successful:', parsed);
    } catch (parseError) {
      console.log('⚠️ JSON parsing failed:', parseError.message);
    }
    
  } catch (error) {
    console.log('❌ Groq API Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
  }
}

testGroqConnection().catch(console.error);