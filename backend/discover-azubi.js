import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function discoverAzubiStructure() {
  console.log('🔍 Discovering azubi.de structure...');
  
  try {
    const scraper = new AusbildungScraperAdvanced('', '', null, 'azubi');
    await scraper.initializeBrowser();
    
    // Let's check the main azubi.de page first
    console.log('\\n📋 Checking main ausbildungsplatz page...');
    await scraper.page.goto('https://www.azubi.de/ausbildungsplatz', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Look for any real job postings
    const jobInfo = await scraper.page.evaluate(() => {
      // Find elements that might contain job postings
      const jobElements = document.querySelectorAll('a[href*=\"ausbildungsplatz\"]');
      const results = [];
      
      for (const element of jobElements) {
        const href = element.href;
        const text = element.textContent?.trim();
        
        // Skip navigation and generic links
        if (text && text.length > 10 && 
            !text.includes('Alle') && 
            !text.includes('Bereich') &&
            !text.includes('Stadt') &&
            !text.includes('schalten')) {
          
          results.push({
            href: href,
            text: text,
            parent: element.parentElement?.textContent?.trim()?.substring(0, 100)
          });
        }
      }
      
      return results.slice(0, 10); // Get first 10 potential jobs
    });
    
    console.log(`Found ${jobInfo.length} potential job listings:`);
    jobInfo.forEach((job, i) => {
      console.log(`${i+1}. ${job.text}`);
      console.log(`   URL: ${job.href}`);
      console.log(`   Context: ${job.parent}`);
      console.log('   ────────────────');
    });
    
    // Test one of the most promising looking URLs
    if (jobInfo.length > 0) {
      const testJob = jobInfo[0];
      console.log(`\\n🧪 Testing extraction from: ${testJob.text}`);
      
      try {
        await scraper.page.goto(testJob.href, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Check page title
        const title = await scraper.page.title();
        console.log(`📄 Page title: ${title}`);
        
        // Try to extract basic info
        const pageData = await scraper.page.evaluate(() => {
          return {
            h1: document.querySelector('h1')?.textContent?.trim(),
            h2: document.querySelector('h2')?.textContent?.trim(),
            bodyText: document.body.innerText.substring(0, 500),
            hasJobData: document.body.innerText.includes('Ausbildung') || 
                       document.body.innerText.includes('Bewerbung') ||
                       document.body.innerText.includes('Unternehmen'),
            emailCount: (document.body.innerText.match(/@/g) || []).length,
            phoneHints: (document.body.innerText.match(/telefon|phone|tel/gi) || []).length
          };
        });
        
        console.log('📊 Page analysis:');
        console.log('  H1:', pageData.h1);
        console.log('  H2:', pageData.h2);
        console.log('  Has job-related content:', pageData.hasJobData);
        console.log('  Email indicators:', pageData.emailCount);
        console.log('  Phone indicators:', pageData.phoneHints);
        console.log('  Body preview:', pageData.bodyText.substring(0, 200) + '...');
        
      } catch (error) {
        console.log(`❌ Error testing job URL: ${error.message}`);
      }
    }
    
    // Now let's try a different approach - search for actual companies
    console.log('\\n🏢 Trying direct company search...');
    await scraper.page.goto('https://www.azubi.de/suche?text=Deutsche+Bahn&ort=Berlin', { waitUntil: 'networkidle2', timeout: 30000 });
    
    const searchResults = await scraper.page.evaluate(() => {
      // Look for search results
      const results = [];
      const links = document.querySelectorAll('a[href]');
      
      for (const link of links) {
        if (link.href.includes('ausbildungsplatz') && 
            link.textContent?.trim() &&
            link.textContent.length > 20 &&
            !link.textContent.includes('schalten')) {
          
          results.push({
            href: link.href,
            text: link.textContent.trim()
          });
        }
      }
      
      return results.slice(0, 5);
    });
    
    console.log(`\\n📋 Search results (${searchResults.length} found):`);
    searchResults.forEach((result, i) => {
      console.log(`${i+1}. ${result.text}`);
      console.log(`   ${result.href}`);
      console.log('   ────────────────');
    });
    
    await scraper.cleanup();
    console.log('\\n✅ Structure discovery completed!');
    
  } catch (error) {
    console.error('❌ Discovery failed:', error.message);
  }
}

discoverAzubiStructure();