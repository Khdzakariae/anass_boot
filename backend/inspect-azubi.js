import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function inspectAzubiPage() {
  console.log('🔍 Inspecting azubi.de page structure...');
  
  try {
    const scraper = new AusbildungScraperAdvanced('Kaufmann', 'Berlin', null, 'azubi');
    await scraper.initializeBrowser();
    
    const searchUrl = 'https://www.azubi.de/suche?text=Kaufmann&location=Berlin&positions[]=ausbildung&page=1';
    console.log('Loading:', searchUrl);
    
    await scraper.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get all links on the page
    const allLinks = await scraper.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links
        .filter(link => link.href.includes('ausbildung'))
        .map(link => ({
          href: link.href,
          text: link.textContent?.trim(),
          className: link.className,
          parentClassName: link.parentElement?.className
        }))
        .slice(0, 20); // Get first 20 relevant links
    });
    
    console.log('\n🔗 Found relevant links:');
    allLinks.forEach((link, i) => {
      console.log(`${i+1}. ${link.href}`);
      console.log(`   Text: "${link.text}"`);
      console.log(`   Class: "${link.className}"`);
      console.log('   ────────────────');
    });
    
    // Check if there are specific job result elements
    const jobElements = await scraper.page.evaluate(() => {
      // Try different possible selectors for job listings
      const selectors = [
        '.job-result',
        '.ausbildung-result', 
        '.search-result',
        '[data-cy*="job"]',
        '.card',
        '.listing-item',
        '.result-item'
      ];
      
      const elements = [];
      for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          elements.push({
            selector,
            count: found.length,
            sample: Array.from(found).slice(0, 3).map(el => ({
              innerHTML: el.innerHTML.substring(0, 200),
              textContent: el.textContent?.trim().substring(0, 100)
            }))
          });
        }
      }
      return elements;
    });
    
    console.log('\n📋 Job elements found:');
    jobElements.forEach(elem => {
      console.log(`Selector: ${elem.selector} (${elem.count} found)`);
      elem.sample.forEach((sample, i) => {
        console.log(`  Sample ${i+1}: ${sample.textContent}...`);
      });
      console.log('   ────────────────');
    });
    
    // Get page title and check if we're on the right page
    const title = await scraper.page.title();
    console.log(`\n📄 Page title: ${title}`);
    
    await scraper.cleanup();
    
  } catch (error) {
    console.error('❌ Inspection failed:', error.message);
  }
}

inspectAzubiPage();