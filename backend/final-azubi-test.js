import { AusbildungScraperAdvanced } from './services/aussbildung.js';

async function finalAzubiTest() {
  console.log('🚀 Final azubi.de integration test...');
  
  try {
    // Test with the corrected azubi.de configuration
    const scraper = new AusbildungScraperAdvanced('Kaufmann', 'Berlin', 'test-user-id', 'azubi');
    await scraper.initializeBrowser();
    
    // Test a known working job URL
    const testJobUrl = 'https://www.azubi.de/ausbildungsplatz/10450146-p-ausbildung-zum-kaufmann-im-einzelhandel-m-w-d-2026';
    
    console.log(`\\n🔬 Testing job extraction from: ${testJobUrl}`);
    
    const jobDetails = await scraper.scrapeJobDetails(testJobUrl);
    
    if (jobDetails) {
      console.log('\\n✅ Successfully extracted complete job details:');
      console.log('  📋 Title:', jobDetails.title);
      console.log('  🏢 Institution:', jobDetails.institution);
      console.log('  📍 Location:', jobDetails.location);
      console.log('  📅 Start Date:', jobDetails.start_date);
      console.log('  👥 Vacancies:', jobDetails.vacancies);
      console.log('  📧 Emails:', jobDetails.emails?.length || 0, 'found');
      console.log('  📞 Phones:', jobDetails.phones?.length || 0, 'found');
      console.log('  🌐 Source:', jobDetails.source);
      
      // Show azubi.de specific fields
      if (jobDetails.requirements && jobDetails.requirements !== 'N/A') {
        console.log('  📝 Requirements:', jobDetails.requirements.substring(0, 100) + '...');
      }
      if (jobDetails.salary && jobDetails.salary !== 'N/A') {
        console.log('  💰 Salary:', jobDetails.salary);
      }
      if (jobDetails.duration && jobDetails.duration !== 'N/A') {
        console.log('  ⏱️  Duration:', jobDetails.duration);
      }
      if (jobDetails.benefits && jobDetails.benefits !== 'N/A') {
        console.log('  🎁 Benefits:', jobDetails.benefits.substring(0, 100) + '...');
      }
      
      console.log('\\n💾 Testing database save...');
      await scraper.saveToDatabase(jobDetails);
      console.log('✅ Database save successful!');
      
    } else {
      console.log('❌ Failed to extract valid job details');
    }
    
    // Now test the full scraping workflow 
    console.log('\\n🔍 Testing full scraping workflow...');
    const results = await scraper.startScraping(1); // Just 1 page for testing
    
    console.log(`\\n📊 Scraping results: ${results.length} jobs processed`);
    if (results.length > 0) {
      console.log('✅ Full workflow test successful!');
      results.slice(0, 3).forEach((job, i) => {
        console.log(`\\n${i+1}. ${job.title}`);
        console.log(`   Company: ${job.institution}`);
        console.log(`   Location: ${job.location}`);
        console.log(`   Start: ${job.start_date}`);
        console.log(`   Source: ${job.source}`);
      });
    } else {
      console.log('⚠️  No jobs were processed in the full workflow');
    }
    
    await scraper.cleanup();
    console.log('\\n🎉 Final azubi.de test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

finalAzubiTest();