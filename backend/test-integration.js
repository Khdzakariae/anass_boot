import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function testIntegration() {
  console.log('🚀 Starting integration test...');
  
  try {
    const scraper = new AusbildungScraperAdvanced('berlin', 'berlin', null, 'ausbildung');
    
    console.log('🔍 Testing ausbildung.de scraping...');
    const results = await scraper.startScraping(1);
    
    console.log(`✅ Test completed! Found ${results.length} jobs`);
    
    if (results.length > 0) {
      console.log('\n📋 Sample result:');
      const job = results[0];
      console.log('  - Title:', job.title);
      console.log('  - Company:', job.company);
      console.log('  - Location:', job.location);
      console.log('  - Email:', job.email || 'No email found');
      console.log('  - Phone:', job.phone || 'No phone found');
      console.log('  - Source:', job.source);
      console.log('  - Description length:', job.description?.length || 0, 'chars');
    }
    
    await scraper.cleanup();
    console.log('\n🎉 Integration test successful!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error(error.stack);
  }
}

testIntegration();