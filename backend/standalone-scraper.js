#!/usr/bin/env node

/**
 * Complete Standalone Job Scraper for German Apprenticeships
 * Supports both azubi.de and ausbildung.de
 * 
 * Usage: node standalone-scraper.js
 * 
 * Requirements: npm install puppeteer
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// ================================
// CONFIGURATION SECTION
// ================================
const CONFIG = {
  // User configurable options
  SEARCH_TERM: 'Pflegefachmann',           // Job title to search for
  LOCATION: 'Bremen',                      // City to search in
  NUM_PAGES_TO_SCRAPE: 3,                 // Number of pages to process
  WEBSITE: 'ausbildung',                   // 'azubi' or 'ausbildung'
  
  // Advanced settings
  DELAY_BETWEEN_REQUESTS: 2000,           // Delay in milliseconds between requests
  DELAY_BETWEEN_PAGES: 3000,              // Delay between page navigation
  REQUEST_TIMEOUT: 30000,                 // Page load timeout
  HEADLESS: true,                         // Run browser in headless mode
  OUTPUT_FILE: 'scraped_jobs.json',       // Output file name
  
  // Browser settings
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
};

// Website configurations
const SITE_CONFIGS = {
  azubi: {
    baseUrl: 'https://www.azubi.de',
    searchPath: '/suche',
    searchParams: (term, location, page) => 
      `?text=${encodeURIComponent(term)}&location=${encodeURIComponent(location)}&positions[]=ausbildung&page=${page}`,
    jobLinkSelector: 'a[href^="/ausbildungsplatz/"]',
    selectors: {
      title: 'h1',
      company: '[data-cy="company-name"]',
      location: '[data-cy="address"]',
      startDate: {
        label: 'Beginn',
        type: 'dt-dd'
      }
    }
  },
  ausbildung: {
    baseUrl: 'https://www.ausbildung.de',
    searchPath: '/suche',
    searchParams: (term, location, page) => 
      `?search=${encodeURIComponent(term)}%7C${encodeURIComponent(location)}&radius=500&page=${page}`,
    jobLinkSelector: 'a[href^="/stellen/"]',
    selectors: {
      title: 'h1',
      company: 'h4[data-testid="jp-customer"], .company-name, [itemprop="hiringOrganization"]',
      location: '[data-testid="jp-branches"], .company-address, .job-location',
      startDate: {
        selectors: ['[data-testid="jp-starting-at"]', '.jp-starting-at', '.start-date'],
        labels: ['Beginn', 'Ausbildungsbeginn', 'Start', 'Startdatum'],
        regexPatterns: [
          /(?:beginn|start|ab)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
          /(?:ausbildungsbeginn)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
          /\b(\d{1,2}\.\d{1,2}\.(?:2024|2025|2026|2027))\b/
        ]
      }
    }
  }
};

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Simple logger with timestamps
 */
const logger = {
  info: (message) => console.log(`[${new Date().toISOString()}] ℹ️  ${message}`),
  success: (message) => console.log(`[${new Date().toISOString()}] ✅ ${message}`),
  warn: (message) => console.log(`[${new Date().toISOString()}] ⚠️  ${message}`),
  error: (message) => console.log(`[${new Date().toISOString()}] ❌ ${message}`)
};

/**
 * Sleep function for delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extract all email addresses from text
 */
const extractEmails = (text) => {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return text.match(emailRegex) || [];
};

/**
 * Sanitize and clean text
 */
const sanitizeText = (text) => {
  if (!text) return 'N/A';
  return text.replace(/\s+/g, ' ').trim();
};

/**
 * Save results to JSON file
 */
const saveResults = (data, filename) => {
  try {
    const outputPath = path.join(process.cwd(), filename);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
    logger.success(`Results saved to: ${outputPath}`);
    logger.info(`Total jobs with emails: ${data.length}`);
  } catch (error) {
    logger.error(`Failed to save results: ${error.message}`);
  }
};

// ================================
// MAIN SCRAPER CLASS
// ================================

class ApprenticeshipScraper {
  constructor(config) {
    this.config = config;
    this.siteConfig = SITE_CONFIGS[config.WEBSITE];
    this.browser = null;
    this.page = null;
    this.results = [];
    this.processedUrls = new Set();
    this.errors = [];
    
    if (!this.siteConfig) {
      throw new Error(`Unsupported website: ${config.WEBSITE}. Use 'azubi' or 'ausbildung'.`);
    }
  }

  /**
   * Initialize Puppeteer browser
   */
  async initializeBrowser() {
    logger.info('🚀 Initializing browser...');
    try {
      this.browser = await puppeteer.launch({
        headless: this.config.HEADLESS,
        args: this.config.BROWSER_ARGS,
        defaultViewport: { width: 1366, height: 768 }
      });
      
      this.page = await this.browser.newPage();
      
      // Set user agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      );
      
      // Block unnecessary resources
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      logger.success('Browser initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize browser: ${error.message}`);
      throw error;
    }
  }

  /**
   * Construct search URL for current page
   */
  constructSearchUrl(pageNumber) {
    const { baseUrl, searchPath, searchParams } = this.siteConfig;
    const params = searchParams(this.config.SEARCH_TERM, this.config.LOCATION, pageNumber);
    return `${baseUrl}${searchPath}${params}`;
  }

  /**
   * Extract job links from search results page
   */
  async extractJobLinks(pageNumber) {
    const searchUrl = this.constructSearchUrl(pageNumber);
    logger.info(`📄 Scraping page ${pageNumber}: ${searchUrl}`);
    
    try {
      await this.page.goto(searchUrl, { 
        waitUntil: 'networkidle2', 
        timeout: this.config.REQUEST_TIMEOUT 
      });
      
      // Wait for job links to appear
      await this.page.waitForSelector(this.siteConfig.jobLinkSelector, { 
        timeout: 10000 
      });
      
      // Extract all job URLs
      const jobUrls = await this.page.$$eval(this.siteConfig.jobLinkSelector, (links) => {
        return [...new Set(links.map(link => {
          const href = link.getAttribute('href');
          if (href.startsWith('/')) {
            return window.location.origin + href;
          }
          return href;
        }))];
      });
      
      logger.info(`Found ${jobUrls.length} job links on page ${pageNumber}`);
      return jobUrls;
      
    } catch (error) {
      logger.error(`Failed to extract job links from page ${pageNumber}: ${error.message}`);
      this.errors.push({ page: pageNumber, error: error.message });
      return [];
    }
  }

  /**
   * Extract start date based on website configuration
   */
  async extractStartDate() {
    const startDateConfig = this.siteConfig.selectors.startDate;
    
    // For azubi.de (dt-dd structure)
    if (startDateConfig.type === 'dt-dd') {
      try {
        const xpath = `//dt[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${startDateConfig.label.toLowerCase()}')]/following-sibling::dd[1]`;
        const elements = await this.page.$x(xpath);
        if (elements.length > 0) {
          const text = await this.page.evaluate(el => el.textContent?.trim(), elements[0]);
          if (text) return sanitizeText(text);
        }
      } catch (error) {
        logger.warn(`Failed to extract start date with dt-dd method: ${error.message}`);
      }
    }
    
    // For ausbildung.de (multiple selectors and regex)
    if (startDateConfig.selectors) {
      // Try selectors first
      for (const selector of startDateConfig.selectors) {
        try {
          const text = await this.page.$eval(selector, el => el.textContent?.trim());
          if (text && text !== 'N/A') return sanitizeText(text);
        } catch (error) {
          // Continue to next selector
        }
      }
      
      // Try labels with xpath
      if (startDateConfig.labels) {
        for (const label of startDateConfig.labels) {
          try {
            const xpath = `//dt[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${label.toLowerCase()}')]/following-sibling::dd[1]`;
            const nodes = await this.page.$x(xpath);
            if (nodes.length > 0) {
              const text = await this.page.evaluate(el => el.textContent?.trim(), nodes[0]);
              if (text) return sanitizeText(text);
            }
          } catch (error) {
            // Continue to next label
          }
        }
      }
      
      // Try regex patterns as last resort
      if (startDateConfig.regexPatterns) {
        try {
          const plainText = await this.page.evaluate(() => document.body.innerText);
          for (const pattern of startDateConfig.regexPatterns) {
            const match = plainText.match(pattern);
            if (match && match[1]) {
              logger.info(`Found start date with regex: ${match[1]}`);
              return sanitizeText(match[1]);
            }
          }
        } catch (error) {
          logger.warn(`Failed to extract start date with regex: ${error.message}`);
        }
      }
    }
    
    return 'N/A';
  }

  /**
   * Extract company name with multiple fallback methods
   */
  async extractCompanyName(url) {
    const companySelectors = this.siteConfig.selectors.company.split(', ');
    
    // Try each selector
    for (const selector of companySelectors) {
      try {
        const company = await this.page.$eval(selector.trim(), el => {
          const text = el.textContent?.trim() || '';
          // Remove "bei " prefix if present
          return text.toLowerCase().startsWith('bei ') ? text.substring(4) : text;
        });
        if (company && company !== 'N/A' && company.length > 1) {
          return sanitizeText(company);
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    // Fallback: extract from URL
    const urlMatch = url.match(/bei-(.*?)-in-/);
    if (urlMatch) {
      return urlMatch[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
    
    return 'N/A';
  }

  /**
   * Extract job details from individual job page
   */
  async extractJobDetails(jobUrl) {
    if (this.processedUrls.has(jobUrl)) {
      logger.warn(`URL already processed: ${jobUrl}`);
      return null;
    }
    
    this.processedUrls.add(jobUrl);
    logger.info(`🔍 Extracting details from: ${jobUrl}`);
    
    try {
      await this.page.goto(jobUrl, { 
        waitUntil: 'networkidle2', 
        timeout: this.config.REQUEST_TIMEOUT 
      });
      
      // Extract title
      const title = await this.page.$eval(this.siteConfig.selectors.title, el => 
        el.textContent?.trim()
      ).catch(() => 'N/A');
      
      // Extract company/institution
      const institution = await this.extractCompanyName(jobUrl);
      
      // Extract location
      const location = await this.page.$eval(this.siteConfig.selectors.location, el => 
        el.textContent?.trim()
      ).catch(() => 'N/A');
      
      // Extract start date
      const startDate = await this.extractStartDate();
      
      // Extract emails from entire page content
      const pageText = await this.page.evaluate(() => document.body.innerText);
      const emails = extractEmails(pageText);
      
      // Create job object
      const jobData = {
        title: sanitizeText(title),
        institution: sanitizeText(institution),
        location: sanitizeText(location),
        startDate: sanitizeText(startDate),
        emails: emails,
        url: jobUrl,
        scrapedAt: new Date().toISOString(),
        source: this.config.WEBSITE
      };
      
      // Only return if emails are found
      if (emails.length > 0) {
        logger.success(`✅ Job data extracted: ${jobData.title} at ${jobData.institution} (${emails.length} emails)`);
        return jobData;
      } else {
        logger.warn(`⏭️  Skipping job (no email found): ${jobData.title} at ${jobData.institution}`);
        return null;
      }
      
    } catch (error) {
      logger.error(`Failed to extract job details from ${jobUrl}: ${error.message}`);
      this.errors.push({ url: jobUrl, error: error.message });
      return null;
    }
  }

  /**
   * Main scraping process
   */
  async startScraping() {
    logger.info(`🕷️  Starting scraping process...`);
    logger.info(`📋 Configuration:`);
    logger.info(`   • Website: ${this.config.WEBSITE}.de`);
    logger.info(`   • Search Term: "${this.config.SEARCH_TERM}"`);
    logger.info(`   • Location: "${this.config.LOCATION}"`);
    logger.info(`   • Pages to scrape: ${this.config.NUM_PAGES_TO_SCRAPE}`);
    
    const startTime = Date.now();
    
    try {
      await this.initializeBrowser();
      
      // Loop through search pages
      for (let pageNum = 1; pageNum <= this.config.NUM_PAGES_TO_SCRAPE; pageNum++) {
        const jobUrls = await this.extractJobLinks(pageNum);
        
        if (jobUrls.length === 0) {
          logger.warn(`No job links found on page ${pageNum}. Stopping scraping.`);
          break;
        }
        
        // Process each job URL
        let pageResults = 0;
        for (const jobUrl of jobUrls) {
          const jobData = await this.extractJobDetails(jobUrl);
          
          if (jobData) {
            this.results.push(jobData);
            pageResults++;
          }
          
          // Delay between requests
          if (this.config.DELAY_BETWEEN_REQUESTS > 0) {
            await sleep(this.config.DELAY_BETWEEN_REQUESTS);
          }
        }
        
        logger.info(`📈 Page ${pageNum} results: ${pageResults} jobs with emails saved`);
        
        // Delay between pages (except for last page)
        if (pageNum < this.config.NUM_PAGES_TO_SCRAPE && this.config.DELAY_BETWEEN_PAGES > 0) {
          await sleep(this.config.DELAY_BETWEEN_PAGES);
        }
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // Final statistics
      logger.success(`✅ Scraping completed successfully!`);
      logger.info(`📊 Final Results:`);
      logger.info(`   • Total jobs with emails: ${this.results.length}`);
      logger.info(`   • Total URLs processed: ${this.processedUrls.size}`);
      logger.info(`   • Total errors: ${this.errors.length}`);
      logger.info(`   • Duration: ${duration}s`);
      
      // Show error summary if any
      if (this.errors.length > 0) {
        logger.warn(`❗ Error Summary (first 5):`);
        this.errors.slice(0, 5).forEach((error, index) => {
          logger.warn(`   ${index + 1}. ${error.url || `Page ${error.page}`}: ${error.error}`);
        });
        if (this.errors.length > 5) {
          logger.warn(`   ... and ${this.errors.length - 5} more errors`);
        }
      }
      
      return this.results;
      
    } catch (error) {
      logger.error(`Critical scraping error: ${error.message}`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info('Browser closed successfully');
      } catch (error) {
        logger.error(`Error closing browser: ${error.message}`);
      }
    }
  }
}

// ================================
// INTERACTIVE SETUP
// ================================

/**
 * Get user input from command line
 */
const getUserInput = (question, defaultValue) => {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question(`${question} [${defaultValue}]: `, (answer) => {
      readline.close();
      resolve(answer.trim() || defaultValue);
    });
  });
};

/**
 * Interactive configuration setup
 */
async function setupConfiguration() {
  console.log('\n🔧 Apprenticeship Scraper Configuration');
  console.log('==========================================\n');
  
  try {
    // Check if user wants interactive setup
    const useDefaults = await getUserInput('Use default configuration? (y/n)', 'y');
    
    if (useDefaults.toLowerCase() !== 'y') {
      CONFIG.WEBSITE = await getUserInput('Website (azubi/ausbildung)', CONFIG.WEBSITE);
      CONFIG.SEARCH_TERM = await getUserInput('Search term', CONFIG.SEARCH_TERM);
      CONFIG.LOCATION = await getUserInput('Location', CONFIG.LOCATION);
      CONFIG.NUM_PAGES_TO_SCRAPE = parseInt(await getUserInput('Number of pages', CONFIG.NUM_PAGES_TO_SCRAPE.toString()));
      
      const advancedSetup = await getUserInput('Configure advanced settings? (y/n)', 'n');
      if (advancedSetup.toLowerCase() === 'y') {
        CONFIG.HEADLESS = (await getUserInput('Run browser headless? (y/n)', CONFIG.HEADLESS ? 'y' : 'n')).toLowerCase() === 'y';
        CONFIG.DELAY_BETWEEN_REQUESTS = parseInt(await getUserInput('Delay between requests (ms)', CONFIG.DELAY_BETWEEN_REQUESTS.toString()));
        CONFIG.OUTPUT_FILE = await getUserInput('Output filename', CONFIG.OUTPUT_FILE);
      }
    }
    
    // Validate website choice
    if (!['azubi', 'ausbildung'].includes(CONFIG.WEBSITE)) {
      logger.error('Invalid website choice. Must be "azubi" or "ausbildung".');
      process.exit(1);
    }
    
    return CONFIG;
    
  } catch (error) {
    logger.error(`Configuration error: ${error.message}`);
    return CONFIG; // Return defaults on error
  }
}

// ================================
// MAIN EXECUTION
// ================================

/**
 * Main function
 */
async function main() {
  console.log('\n🎯 German Apprenticeship Job Scraper');
  console.log('=====================================');
  console.log('Supports: azubi.de & ausbildung.de\n');
  
  try {
    // Setup configuration
    const config = await setupConfiguration();
    
    // Create and run scraper
    const scraper = new ApprenticeshipScraper(config);
    const results = await scraper.startScraping();
    
    // Save results
    if (results.length > 0) {
      saveResults(results, config.OUTPUT_FILE);
      
      // Display sample results
      console.log('\n📋 Sample Results:');
      console.log('==================');
      results.slice(0, 3).forEach((job, index) => {
        console.log(`\n${index + 1}. ${job.title}`);
        console.log(`   Company: ${job.institution}`);
        console.log(`   Location: ${job.location}`);
        console.log(`   Start: ${job.startDate}`);
        console.log(`   Emails: ${job.emails.join(', ')}`);
        console.log(`   URL: ${job.url}`);
      });
      
      if (results.length > 3) {
        console.log(`\n... and ${results.length - 3} more jobs`);
      }
    } else {
      logger.warn('No jobs with email addresses were found.');
    }
    
  } catch (error) {
    logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ApprenticeshipScraper, CONFIG, SITE_CONFIGS };