#!/usr/bin/env node

/**
 * Quick test script for the merged scraper functionality
 * Run with: node test-scraper.js
 */

import { AusbildungScraperAdvanced } from './services/aussbildung.js';
import config from './config.js';

async function testScraper() {
  console.log('🧪 Testing integrated scraper functionality...\n');
  
  // Test configurations
  const testConfigs = [
    {
      searchTerm: 'Pflegefachmann',
      location: 'Berlin',
      website: 'ausbildung',
      pages: 1
    },
    {
      searchTerm: 'Kaufmann',
      location: 'München',
      website: 'azubi',
      pages: 1
    }
  ];
  
  for (const testConfig of testConfigs) {
    console.log(`\n📋 Testing: ${testConfig.website}.de`);
    console.log(`   Search: "${testConfig.searchTerm}" in ${testConfig.location}`);
    console.log(`   Pages: ${testConfig.pages}`);
    
    try {
      // Create scraper instance (without userId for testing)
      const scraper = new (class extends AusbildungScraperAdvanced {
        constructor(...args) {
          super(...args);
        }
        
        // Override database operations for testing
        async saveToDatabase(jobData) {
          console.log(`   ✅ Would save: ${jobData.title} at ${jobData.institution}`);
          console.log(`      📧 Emails: ${jobData.emails?.join(', ') || 'None'}`);
          console.log(`      🌐 Source: ${jobData.source || this.website}.de`);
          return true;
        }
      })(testConfig.searchTerm, testConfig.location, 'test-user', testConfig.website);
      
      // Test browser initialization only
      await scraper.initializeBrowser();
      console.log(`   ✅ Browser initialized successfully`);
      
      // Test URL construction
      const testUrl = `${scraper.config.baseUrl}${scraper.config.searchParams(scraper.searchTerm, scraper.location, 1)}`;
      console.log(`   🔗 Test URL: ${testUrl}`);
      
      await scraper.cleanup();
      console.log(`   ✅ Cleanup completed`);
      
    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}`);
    }
  }
  
  console.log('\n🎉 Integration test completed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Start your backend server: npm start');
  console.log('   2. Start your frontend: cd front && npm run dev');
  console.log('   3. Navigate to the scrape page and test with real data');
  console.log('   4. Check the dashboard to see scraped jobs with source info');
}

// Run the test
testScraper().catch(console.error);