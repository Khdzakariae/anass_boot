import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function testEnhancedAzubi() {
  console.log('🚀 Testing enhanced azubi.de scraping...');
  
  try {
    const scraper = new AusbildungScraperAdvanced('', '', null, 'azubi');
    await scraper.initializeBrowser();
    
    // Test with a known azubi.de URL pattern
    const testUrls = [
      'https://www.azubi.de/ausbildungsplatz/kaufmann-fuer-bueromanagement-bei-db-vertrieb-gmbh-in-berlin',
      'https://www.azubi.de/ausbildungsplatz/fachinformatiker-anwendungsentwicklung-bei-bundesdruckerei-gmbh-in-berlin'
    ];
    
    for (const testUrl of testUrls) {
      console.log(`\n🔍 Testing URL: ${testUrl}`);
      
      try {
        await scraper.page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('📄 Page loaded successfully');
        
        // Test extraction of various fields
        const extractedData = {};
        
        // Title
        try {
          extractedData.title = await scraper.page.$eval('h1', el => el.textContent?.trim());
        } catch (e) { extractedData.title = 'N/A'; }
        
        // Company
        try {
          const selectors = ['[data-cy=\"company-name\"]', '.company-name', 'h2', '.employer-name'];
          for (const selector of selectors) {
            try {
              extractedData.company = await scraper.page.$eval(selector, el => el.textContent?.trim());
              if (extractedData.company) break;
            } catch (e) {}
          }
          if (!extractedData.company) extractedData.company = 'N/A';
        } catch (e) { extractedData.company = 'N/A'; }
        
        // Location  
        try {
          const selectors = ['[data-cy=\"address\"]', '.job-location', '.address', '.ort'];
          for (const selector of selectors) {
            try {
              extractedData.location = await scraper.page.$eval(selector, el => el.textContent?.trim());
              if (extractedData.location) break;
            } catch (e) {}
          }
          if (!extractedData.location) extractedData.location = 'N/A';
        } catch (e) { extractedData.location = 'N/A'; }
        
        // Extract emails and phones from page content
        const pageContent = await scraper.page.content();
        const plainText = await scraper.page.evaluate(() => document.body.innerText);
        
        // Email extraction
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const emails = [...plainText.matchAll(emailRegex)].map(m => m[1]);
        extractedData.emails = [...new Set(emails)];
        
        // Phone extraction
        const phoneRegex = /(\+?49\s?\(?0?\)?\s?\d{1,4}[\s\-\.]?\d{1,4}[\s\-\.]?\d{1,9})/g;
        const phones = [...plainText.matchAll(phoneRegex)].map(m => m[1]);
        extractedData.phones = [...new Set(phones)];
        
        console.log('📋 Extracted data:');
        console.log('  Title:', extractedData.title);
        console.log('  Company:', extractedData.company);
        console.log('  Location:', extractedData.location);
        console.log('  Emails:', extractedData.emails);
        console.log('  Phones:', extractedData.phones);
        
        // Check if this looks like a valid job posting
        if (extractedData.title !== 'N/A' && extractedData.company !== 'N/A') {
          console.log('✅ Valid job posting found!');
        } else {
          console.log('❌ This does not appear to be a valid job posting');
        }
        
      } catch (error) {
        console.log(`❌ Failed to process ${testUrl}:`, error.message);
      }
    }
    
    await scraper.cleanup();
    console.log('\n🎉 Enhanced azubi.de test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEnhancedAzubi();