// Test requires GROQ_API_KEY environment variable
if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY environment variable is required');
  console.log('Set it with: export GROQ_API_KEY=<your_groq_api_key>');
  process.exit(1);
}

import { getInsightExtractor } from './src/utils/smart-context/insight-extractor.js';
import { getMicroChunkManager } from './src/utils/smart-context/micro-chunk-manager.js';
import { getEnhancedSmartContextService } from './src/utils/smart-context/smart-context-service-v2.js';

async function testSmartContextV2() {
  console.log('🧪 Testing Smart Context V2 Micro-Chunk System\n');
  
  // Test 1: Insight Extractor
  console.log('1️⃣ Testing Insight Extractor...');
  const extractor = getInsightExtractor();
  console.log('   Extractor available:', extractor.isAvailable());
  
  if (extractor.isAvailable()) {
    console.log('   Testing connection...');
    const connectionTest = await extractor.testConnection();
    console.log('   ✅ Connection test:', connectionTest ? 'PASSED' : 'FAILED');
    
    // Test insight extraction from user prompt
    console.log('   Testing insight extraction from user prompt...');
    const insights = await extractor.extractFromPrompt(
      'I need help debugging authentication errors in my Node.js app using JWT tokens',
      { projectType: 'nodejs-app' }
    );
    console.log('   📊 Extracted insights:', insights.length);
    insights.forEach((insight, i) => {
      console.log(`      ${i+1}. ${insight.category}/${insight.subcategory}: "${insight.content}" (confidence: ${insight.confidence})`);
      console.log(`         Keywords: [${insight.keywords.join(', ')}]`);
    });
  }
  
  // Test 2: Micro-Chunk Manager
  console.log('\n2️⃣ Testing Micro-Chunk Manager...');
  const manager = getMicroChunkManager();
  await manager.initialize(process.cwd());
  
  const stats = manager.getStats();
  console.log('   📈 Manager stats:', stats);
  
  // Test 3: Enhanced Smart Context Service
  console.log('\n3️⃣ Testing Enhanced Smart Context Service V2...');
  const service = getEnhancedSmartContextService();
  console.log('   Service available:', service.isAvailable());
  
  if (service.isAvailable()) {
    // Test system components
    const systemTest = await service.testSystem();
    console.log('   🔧 System test results:', systemTest);
    
    // Test context enhancement
    console.log('   Testing context enhancement...');
    const result = await service.enhanceInstructions(
      'You are a helpful assistant.',
      'How do I fix JWT authentication issues in my Node.js API?',
      process.cwd()
    );
    
    console.log('   🎯 Enhancement result:', {
      success: result.success,
      contextSummary: result.contextSummary,
      chunksUsed: result.chunksUsed,
      keywords: result.keywords,
      categories: result.categories,
      processingTime: result.processingTime + 'ms'
    });
    
    // Test storage (background operation)
    console.log('   Testing insight storage...');
    await service.storeFromPrompt(
      'I want to implement OAuth2 authentication with Google in my React app',
      process.cwd(),
      { projectType: 'react-app' }
    );
    
    // Wait a moment for background processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check stats after storage
    const newStats = manager.getStats();
    console.log('   📊 Updated stats after storage:', newStats);
    
    // Test retrieval query generation
    console.log('   Testing retrieval query generation...');
    const query = await extractor.extractRetrievalQuery('How do I implement secure password hashing?');
    console.log('   🔍 Generated query:', query);
    
    // Test chunk retrieval
    if (query.keywords.length > 0 || query.categories.length > 0) {
      const chunks = await manager.retrieveRelevantChunks(query.keywords, query.categories, 3);
      console.log('   📦 Retrieved chunks:', chunks.length);
      chunks.forEach((chunk, i) => {
        console.log(`      ${i+1}. ${chunk.id}: "${chunk.content.substring(0, 50)}..." (confidence: ${chunk.confidence})`);
      });
    }
  }
  
  console.log('\n✅ Smart Context V2 Testing Complete!');
}

testSmartContextV2().catch(console.error);