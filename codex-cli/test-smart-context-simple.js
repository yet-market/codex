// Simple Smart Context V2 Test
import { log } from './dist/utils/logger/log.js';
import { enhanceInstructionsWithMicroChunks, storeInsightsFromPrompt } from './dist/utils/smart-context/smart-context-service-v2.js';

// Test requires GROQ_API_KEY environment variable
if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY environment variable is required');
  console.log('Set it with: export GROQ_API_KEY=your_key_here');
  process.exit(1);
}

async function testSmartContextV2Simple() {
  console.log('🧪 Simple Smart Context V2 Test\n');
  
  try {
    // Test 1: Store insights from user prompt (background)
    console.log('1️⃣ Testing insight storage from user prompt...');
    await storeInsightsFromPrompt(
      'I need help debugging authentication errors in my Node.js API using JWT tokens. The tokens are expiring too quickly.',
      process.cwd(),
      { projectType: 'nodejs-api' }
    );
    console.log('   ✅ Background storage initiated');
    
    // Wait for background processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 2: Enhance instructions with context
    console.log('\n2️⃣ Testing context enhancement...');
    const result = await enhanceInstructionsWithMicroChunks(
      'You are a helpful coding assistant.',
      'How do I fix JWT token validation issues in Node.js?',
      process.cwd()
    );
    
    console.log('   🎯 Enhancement result:');
    console.log('      Success:', result.success);
    console.log('      Context summary:', result.contextSummary);
    console.log('      Chunks used:', result.chunksUsed);
    console.log('      Keywords:', result.keywords);
    console.log('      Categories:', result.categories);
    console.log('      Processing time:', result.processingTime + 'ms');
    
    if (result.success && result.chunksUsed > 0) {
      console.log('\n   📄 Enhanced instructions preview:');
      console.log('      ' + result.enhancedInstructions.substring(0, 200) + '...');
    }
    
    console.log('\n✅ Smart Context V2 Simple Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSmartContextV2Simple();