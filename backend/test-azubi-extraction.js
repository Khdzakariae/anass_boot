import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function testAzubiExtraction() {
  console.log('🚀 Testing azubi.de information extraction...');
  
  try {
    const scraper = new AusbildungScraperAdvanced('Kaufmann', 'Berlin', null, 'azubi');
    await scraper.initializeBrowser();
    
    // First, let's find some job URLs
    console.log('🔍 Finding job URLs on azubi.de...');
    const searchUrl = scraper.config.baseUrl + scraper.config.searchParams('Kaufmann', 'Berlin', 1);
    console.log('Search URL:', searchUrl);
    
    await scraper.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Get first few job links - use a more specific selector
    const jobLinks = await scraper.page.$$eval('a[href*="/ausbildungsplatz/"][href*="-bei-"]', links => 
      links.slice(0, 2).map(link => link.href)
    ).catch(() => []);
    
    // If that doesn't work, try alternative selectors
    if (jobLinks.length === 0) {
      const altJobLinks = await scraper.page.$$eval('.job-item a, .ausbildung-item a, [data-cy="job-link"]', links => 
        links.slice(0, 2).map(link => link.href)
      ).catch(() => []);
      jobLinks.push(...altJobLinks);
    }
    
    console.log(`Found ${jobLinks.length} job links:`, jobLinks);
    
    // Test extraction on each job
    for (const jobUrl of jobLinks) {
      console.log(`\n📝 Testing extraction for: ${jobUrl}`);
      
      await scraper.page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Test different selectors for azubi.de
      const testSelectors = {
        title: ['h1', '[data-cy="job-title"]', '.job-title'],
        company: ['[data-cy="company-name"]', '.company-name', '[data-testid="company-name"]', 'h2'],
        location: ['[data-cy="address"]', '.job-location', '[data-cy="location"]', '.address'],
        startDate: ['dt:contains("Beginn") + dd', '.start-date', '[data-cy="start-date"]'],
        vacancies: ['.vacancies', '[data-cy="vacancies"]', '.available-positions'],
        requirements: ['.requirements', '[data-cy="requirements"]', '.job-requirements'],
        salary: ['.salary', '[data-cy="salary"]', '.compensation'],
        description: ['.job-description', '[data-cy="description"]', '.content']
      };
      
      for (const [field, selectors] of Object.entries(testSelectors)) {
        for (const selector of selectors) {
          try {
            const value = await scraper.page.$eval(selector, el => el.textContent?.trim());
            if (value) {
              console.log(`  ✅ ${field} (${selector}): ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
              break;
            }
          } catch (e) {
            // Selector not found, continue
          }
        }
      }
      
      // Test contact information extraction
      console.log('  📧 Testing contact extraction...');
      try {
        const contactInfo = await scraper.page.evaluate(() => {
          const allText = document.body.innerText;
          const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
          const phoneRegex = /(\+?\d{1,4}[\s\-\.]?\(?\d{1,4}\)?[\s\-\.]?\d{1,4}[\s\-\.]?\d{1,9})/g;
          
          const emails = [...allText.matchAll(emailRegex)].map(m => m[1]);
          const phones = [...allText.matchAll(phoneRegex)].map(m => m[1]);
          
          return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
        });
        
        console.log('  📧 Emails found:', contactInfo.emails);
        console.log('  📞 Phones found:', contactInfo.phones);
        
      } catch (e) {
        console.log('  ❌ Contact extraction failed:', e.message);
      }
      
      console.log('  ─────────────────────────────────────────');
    }
    
    await scraper.cleanup();
    console.log('\n🎉 Azubi.de extraction test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAzubiExtraction();