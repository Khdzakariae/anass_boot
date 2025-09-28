import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function comprehensiveAzubiTest() {
  console.log('🚀 Comprehensive azubi.de integration test...');
  
  try {
    const scraper = new AusbildungScraperAdvanced('', '', null, 'azubi');
    await scraper.initializeBrowser();
    
    // Try different search approaches for azubi.de
    const searchUrls = [
      'https://www.azubi.de/beruf/ausbildung-kaufmann/ausbildungsplaetze/stadt/berlin',
      'https://www.azubi.de/ausbildungsplaetze/kaufmann/berlin',
      'https://www.azubi.de/suche?text=Kaufmann&ort=Berlin',
      'https://www.azubi.de/ausbildungsplatz'
    ];
    
    let foundJobs = [];
    
    for (const searchUrl of searchUrls) {
      console.log(`\\n🔍 Trying search: ${searchUrl}`);
      
      try {
        await scraper.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        const title = await scraper.page.title();
        console.log(`📄 Page title: ${title}`);
        
        // Try multiple selectors to find job links
        const jobLinkSelectors = [
          'a[href*=\"ausbildungsplatz\"][href*=\"-bei-\"]',
          'a[href*=\"/ausbildung/\"]',
          'a[href*=\"stellenanzeige\"]',
          '.job-title a',
          '.ausbildung-title a',
          '[data-testid=\"job-link\"]'
        ];
        
        for (const selector of jobLinkSelectors) {
          try {
            const links = await scraper.page.$$eval(selector, elements => 
              elements.slice(0, 3).map(el => ({
                href: el.href,
                text: el.textContent?.trim()
              }))
            );
            
            if (links.length > 0) {
              console.log(`  ✅ Found ${links.length} jobs with selector: ${selector}`);
              foundJobs.push(...links);
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // If no job links found, check what links are available
        if (foundJobs.length === 0) {
          const allLinks = await scraper.page.$$eval('a[href]', elements => 
            elements
              .filter(el => el.href.includes('ausbildung') && el.textContent?.trim())
              .slice(0, 10)
              .map(el => ({
                href: el.href,
                text: el.textContent?.trim().substring(0, 50)
              }))
          );
          
          console.log('  📋 Available ausbildung-related links:');
          allLinks.forEach((link, i) => {
            console.log(`    ${i+1}. ${link.text} -> ${link.href}`);
          });
        }
        
      } catch (error) {
        console.log(`  ❌ Failed to load ${searchUrl}:`, error.message);
      }
      
      if (foundJobs.length > 0) break; // Found some jobs, stop searching
    }
    
    console.log(`\\n📊 Found ${foundJobs.length} potential job postings`);
    
    // Test extraction on found jobs
    for (let i = 0; i < Math.min(foundJobs.length, 2); i++) {
      const job = foundJobs[i];
      console.log(`\\n🔬 Testing job ${i+1}: ${job.text}`);
      console.log(`🔗 URL: ${job.href}`);
      
      try {
        const jobDetails = await scraper.scrapeJobDetails(job.href);
        
        if (jobDetails) {
          console.log('✅ Successfully extracted job details:');
          console.log('  📋 Title:', jobDetails.title);
          console.log('  🏢 Institution:', jobDetails.institution);
          console.log('  📍 Location:', jobDetails.location);
          console.log('  📅 Start Date:', jobDetails.start_date);
          console.log('  👥 Vacancies:', jobDetails.vacancies);
          console.log('  📧 Emails:', jobDetails.emails?.length || 0);
          console.log('  📞 Phones:', jobDetails.phones?.length || 0);
          
          if (jobDetails.requirements) console.log('  📝 Requirements:', jobDetails.requirements.substring(0, 100) + '...');
          if (jobDetails.salary) console.log('  💰 Salary:', jobDetails.salary);
          if (jobDetails.duration) console.log('  ⏱️  Duration:', jobDetails.duration);
          
        } else {
          console.log('❌ Failed to extract valid job details');
        }
        
      } catch (error) {
        console.log(`❌ Error processing job: ${error.message}`);
      }
    }
    
    await scraper.cleanup();
    console.log('\\n🎉 Comprehensive azubi.de test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

comprehensiveAzubiTest();