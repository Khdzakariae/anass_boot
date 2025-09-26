// ausbildung-scraper.js
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
const pdf = require('pdf-parse');

// MongoDB Schema
const ausbildungSchema = new mongoose.Schema({
  title: { type: String, required: true },
  institution: { type: String, required: true },
  location: { type: String, default: 'N/A' },
  start_date: { type: String, default: 'N/A' },
  vacancies: { type: String, default: 'N/A' },
  description: { type: String, default: 'N/A' },
  emails: [String],
  url: { type: String, required: true, unique: true },
  motivation_letter_path: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const Ausbildung = mongoose.model('Ausbildung', ausbildungSchema);

class AusbildungScraperJS {
  constructor(searchTerm, location = '', mongoUri = 'mongodb://localhost:27017/ausbildung_db') {
    this.searchTerm = encodeURIComponent(searchTerm);
    this.location = encodeURIComponent(location);
    this.baseUrl = 'https://www.ausbildung.de/suche/';
    this.mongoUri = mongoUri;
    this.browser = null;
    this.page = null;
    this.processedUrls = new Set();
  }

  async initializeBrowser() {
    console.log('🚀 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  }

  async connectToDatabase() {
    console.log('📊 Connecting to MongoDB...');
    try {
      await mongoose.connect(this.mongoUri);
      console.log('✅ Connected to MongoDB successfully');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    }
  }

  async extractFieldFromPage(selector, labelTexts = [], debugName = null) {
    try {
      if (debugName) {
        console.log(`   -> Extracting ${debugName}...`);
      }

      // Try direct CSS selectors first
      for (const sel of selector) {
        const element = await this.page.$(sel);
        if (element) {
          const text = await this.page.evaluate(el => el.textContent?.trim() || '', element);
          
          if (text && text.length > 0) {
            if (debugName) {
              console.log(`      Found with selector '${sel}': '${text}'`);
            }

            // Special processing for different fields
            if (sel.includes('jp-starting-at')) {
              const dateMatch = text.match(/\d{1,2}\.\d{1,2}\.(\d{4}|\d{2})/);
              if (dateMatch) {
                return dateMatch[0];
              }
            }

            if (sel.includes('jp-branches')) {
              const cleanLocation = text.replace(/\+\s*\d+\s*weitere.*$/gi, '').trim();
              if (cleanLocation) return cleanLocation;
            }

            if (sel.includes('jp-vacancies')) {
              const vacancyMatch = text.match(/(\d+)\s*(?:Plätze?)?/i);
              if (vacancyMatch) {
                const number = vacancyMatch[1];
                return text.toLowerCase().includes('plätze') ? `${number} Plätze` : number;
              }
            }

            if (text && !text.toLowerCase().includes('jp-') && !text.includes('data-testid')) {
              return text;
            }
          }
        }
      }

      // Try finding by label text (dt/dd pattern)
      for (const label of labelTexts) {
        try {
          const dtElement = await this.page.$x(`//dt[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${label.toLowerCase()}')]`);
          if (dtElement.length > 0) {
            const ddElement = await this.page.evaluateHandle(dt => dt.nextElementSibling, dtElement[0]);
            if (ddElement) {
              const result = await this.page.evaluate(dd => dd?.textContent?.trim() || '', ddElement);
              if (result) {
                if (debugName) {
                  console.log(`      Found via label '${label}': '${result}'`);
                }
                return result;
              }
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (debugName) {
        console.log(`      No data found for ${debugName}`);
      }
      
      return 'N/A';
    } catch (error) {
      console.error(`Error extracting field ${debugName}:`, error);
      return 'N/A';
    }
  }

  async scrapeJobDetails(url) {
    console.log(`   -> Processing: ${url}`);
    
    try {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      
      // Extract title
      const title = await this.page.$eval('h1', el => el.textContent?.trim() || 'N/A').catch(() => 'N/A');
      
      // Extract institution
      let institution = 'N/A';
      const instSelectors = ['h4[data-testid="jp-customer"]', '.company-name', '[itemprop="hiringOrganization"]'];
      
      for (const selector of instSelectors) {
        try {
          institution = await this.page.$eval(selector, el => {
            const text = el.textContent?.trim() || '';
            return text.toLowerCase().startsWith('bei ') ? text.substring(4) : text;
          });
          if (institution && institution !== 'N/A') break;
        } catch (e) {
          continue;
        }
      }

      // If institution not found, parse from URL
      if (institution === 'N/A' || institution.length < 2) {
        const urlMatch = url.match(/bei-(.*?)-in-/);
        if (urlMatch) {
          institution = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      }

      // Extract location
      const location = await this.extractFieldFromPage(
        ['[data-testid="jp-branches"]', '.company-address', '.job-location', '[class*="location"]', '[class*="address"]', '[class*="standort"]'],
        ['Standort', 'Standorte', 'Ort', 'Adresse'],
        'location'
      );

      // Extract start date
      let startDate = await this.extractFieldFromPage(
        ['[data-testid="jp-starting-at"]', '.jp-starting-at', '.start-date', '[class*="start"]', '[class*="begin"]'],
        ['Beginn', 'Ausbildungsbeginn', 'Start', 'Startdatum'],
        'start_date'
      );

      // Additional start date extraction
      if (startDate === 'N/A') {
        const pageContent = await this.page.content();
        const datePatterns = [
          /(?:beginn|start|ab):?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
          /(?:ausbildungsbeginn):?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
          /\b(\d{1,2}\.\d{1,2}\.(?:2024|2025|2026))\b/
        ];

        for (const pattern of datePatterns) {
          const match = pageContent.match(pattern);
          if (match) {
            startDate = match[1];
            break;
          }
        }
      }

      // Extract vacancies
      let vacancies = await this.extractFieldFromPage(
        ['[data-testid="jp-vacancies"]', '.vacancies', '.job-vacancies', '[class*="platz"]', '[class*="vacan"]'],
        ['Freie Plätze', 'Plätze', 'Anzahl', 'Stellen'],
        'vacancies'
      );

      // Alternative vacancy extraction
      if (vacancies === 'N/A') {
        const pageContent = await this.page.content();
        const vacancyMatch = pageContent.match(/(\d+)\s*(?:freie?\s*)?(?:plätze?|stelle[n]?)/i);
        if (vacancyMatch) {
          vacancies = vacancyMatch[1];
        }
      }

      // Extract description (get main content)
      let description = 'N/A';
      try {
        const descSelectors = ['.job-description', '.job-content', '[class*="description"]', '.content', 'main'];
        for (const selector of descSelectors) {
          const element = await this.page.$(selector);
          if (element) {
            description = await this.page.evaluate(el => {
              const text = el.textContent?.trim() || '';
              return text.length > 50 ? text.substring(0, 500) + '...' : text;
            }, element);
            if (description && description !== 'N/A') break;
          }
        }
      } catch (e) {
        console.log('   -> Could not extract description');
      }

      // Extract emails
      const pageContent = await this.page.content();
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = [...new Set(pageContent.match(emailRegex) || [])];

      const jobData = {
        title,
        institution: institution.trim(),
        location,
        start_date: startDate,
        vacancies,
        description,
        emails,
        url
      };

      console.log(`   ✅ Scraped: ${title} at ${institution}`);
      return jobData;

    } catch (error) {
      console.error(`   ❌ Error scraping ${url}:`, error.message);
      return null;
    }
  }

  async saveToDatabase(jobData) {
    try {
      const existingJob = await Ausbildung.findOne({ url: jobData.url });
      
      if (existingJob) {
        // Update existing job
        Object.assign(existingJob, { ...jobData, updated_at: new Date() });
        await existingJob.save();
        console.log(`   📝 Updated existing job: ${jobData.title}`);
        return existingJob;
      } else {
        // Create new job
        const newJob = new Ausbildung(jobData);
        await newJob.save();
        console.log(`   💾 Saved new job: ${jobData.title}`);
        return newJob;
      }
    } catch (error) {
      console.error(`   ❌ Error saving to database:`, error.message);
      return null;
    }
  }

  async startScraping(numPages = 3) {
    console.log('🕷️  Starting scraping process...');
    
    try {
      await this.initializeBrowser();
      await this.connectToDatabase();

      let totalResults = 0;

      for (let page = 1; page <= numPages; page++) {
        console.log(`\n📄 Scraping page ${page}...`);
        const searchUrl = `${this.baseUrl}?q=${this.searchTerm}&location=${this.location}&page=${page}`;

        // const searchUrl = `${this.baseUrl}?search=${this.searchTerm}&location=${this.location}&page=${page}`;
        console.log(`   URL: ${searchUrl}`);
        
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Wait for job listings
        try {
          await this.page.waitForSelector("a[href^='/stellen/']", { timeout: 10000 });
        } catch (e) {
          console.log(`   No job listings found on page ${page}. Ending scrape.`);
          break;
        }

        // Get job URLs
        const jobUrls = await this.page.$$eval("a[href^='/stellen/']", links => 
          [...new Set(links.map(link => link.href).filter(href => href))]
        );

        console.log(`   Found ${jobUrls.length} unique job listings on page ${page}`);

        // Process each job
        for (let i = 0; i < jobUrls.length; i++) {
          const jobUrl = jobUrls[i];
          
          if (this.processedUrls.has(jobUrl)) {
            console.log(`   ⏭️  Skipping already processed: ${jobUrl}`);
            continue;
          }

          this.processedUrls.add(jobUrl);
          
          console.log(`\n   Processing job ${i + 1}/${jobUrls.length}`);
          
          const jobData = await this.scrapeJobDetails(jobUrl);
          
          if (jobData) {
            await this.saveToDatabase(jobData);
            totalResults++;
          }

          // Small delay to be respectful
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Delay between pages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n✅ Scraping completed! Total jobs processed: ${totalResults}`);
      
    } catch (error) {
      console.error('❌ Scraping error:', error);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
      await mongoose.disconnect();
    }
  }
}

// Motivation Letter Generator
class GermanMotivationLetterGenerator {
  constructor(apiKey, mongoUri = 'mongodb://localhost:27017/ausbildung_db') {
    this.apiKey = apiKey;
    this.mongoUri = mongoUri;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    this.outputDir = 'bewerbungsschreiben';
  }

  async connectToDatabase() {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(this.mongoUri);
    }
  }

  async extractCVText(cvPath) {
    try {
      const dataBuffer = await fs.readFile(cvPath);
      const data = await pdf(dataBuffer);
      return data.text.trim();
    } catch (error) {
      console.error('Error extracting CV:', error);
      return '';
    }
  }

  cleanFilename(institution) {
    return institution
      .replace(/[^\w\s-]/g, '')
      .replace(/[-\s]+/g, '_')
      .substring(0, 50);
  }

  async generateMotivationLetter(jobInfo, cvText) {
    const { title, institution, description, location, start_date } = jobInfo;

    const contextParts = [];
    if (title && title !== 'N/A') contextParts.push(`Ausbildungsposition: ${title}`);
    if (location && location !== 'N/A') contextParts.push(`Standort: ${location}`);
    if (start_date && start_date !== 'N/A') contextParts.push(`Ausbildungsbeginn: ${start_date}`);

    const context = contextParts.join('\n');

    const prompt = `Ich bewerbe mich um eine Ausbildung bei "${institution}".

Stellenausschreibung:
${context}

${description && description !== 'N/A' ? `Stellenbeschreibung: ${description}` : ''}

Mein Lebenslauf:
${cvText}

Bitte verfasse ein professionelles und überzeugendes Bewerbungsschreiben für diese Ausbildungsstelle.

Anforderungen:
- Vollständig auf Deutsch
- Professioneller und höflicher Ton
- Struktur: Betreff, Anrede, Einleitung, Hauptteil, Schluss, Grußformel
- 300-450 Wörter
- Speziell auf die Ausbildung und das Unternehmen zugeschnitten
- Betone relevante Erfahrungen und Motivation für diese Ausbildung
- Zeige Interesse am Unternehmen und der Branche
- Erwähne persönliche Stärken die zur Ausbildung passen
- Beginne mit einem passenden Betreff (z.B. "Bewerbung um einen Ausbildungsplatz als...")
- Verwende "Sehr geehrte Damen und Herren," als Anrede
- Schließe mit "Mit freundlichen Grüßen" ab
- Keine Adresse, Datum oder Unterschrift

Das Bewerbungsschreiben soll meine Motivation und Eignung für diese spezifische Ausbildung deutlich machen.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`Error generating letter for ${institution}:`, error);
      return null;
    }
  }

  async createPDF(letterText, filename, jobTitle = '', company = '') {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(filename);
        doc.pipe(stream);

        // Header
        if (jobTitle && company) {
          doc.fontSize(14).font('Helvetica-Bold').text(`Bewerbung: ${jobTitle}`, { align: 'center' });
          doc.fontSize(12).font('Helvetica').text(`bei ${company}`, { align: 'center' });
          doc.moveDown(2);
        }

        // Letter content
        doc.fontSize(11).font('Helvetica');
        
        const lines = letterText.split('\n');
        lines.forEach(line => {
          if (line.trim() === '') {
            doc.moveDown(0.5);
          } else {
            doc.text(line, { align: 'left' });
          }
        });

        doc.end();

        stream.on('finish', () => resolve(true));
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateAllMotivationLetters(cvPath) {
    console.log('📝 Starting motivation letter generation...');
    
    try {
      await this.connectToDatabase();

      // Create output directory
      await fs.mkdir(this.outputDir, { recursive: true });

      // Extract CV text
      console.log('📄 Extracting CV text...');
      const cvText = await this.extractCVText(cvPath);
      if (!cvText) {
        throw new Error('Could not extract CV text');
      }
      console.log(`✅ CV extracted successfully (${cvText.length} characters)`);

      // Get all jobs from database
      const jobs = await Ausbildung.find({});
      console.log(`📊 Found ${jobs.length} jobs in database`);

      let successfulLetters = 0;
      let skippedNoEmail = 0;

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing job ${i + 1}/${jobs.length}`);
        console.log(`Position: ${job.title}`);
        console.log(`Company: ${job.institution}`);
        console.log(`Location: ${job.location}`);
        console.log(`Emails: ${job.emails.join(', ')}`);

        // Skip if no email
        if (!job.emails || job.emails.length === 0) {
          console.log('⏭️  Skipping - no email address');
          skippedNoEmail++;
          continue;
        }

        // Generate motivation letter
        console.log('🤖 Generating motivation letter...');
        const letterText = await this.generateMotivationLetter(job.toObject(), cvText);

        if (letterText) {
          // Create filename
          const cleanCompanyName = this.cleanFilename(job.institution);
          const filename = `Bewerbung_${cleanCompanyName}_${job._id}.pdf`;
          const filepath = path.join(this.outputDir, filename);

          // Create PDF
          console.log(`📄 Creating PDF: ${filename}`);
          const pdfCreated = await this.createPDF(letterText, filepath, job.title, job.institution);

          if (pdfCreated) {
            // Update database with motivation letter path
            job.motivation_letter_path = filepath;
            job.updated_at = new Date();
            await job.save();

            successfulLetters++;
            console.log(`✅ Motivation letter created: ${filename}`);
          } else {
            console.log(`❌ Error creating PDF for ${job.institution}`);
          }
        } else {
          console.log(`❌ Error generating letter for ${job.institution}`);
        }

        // Small delay to avoid API rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log('📊 SUMMARY:');
      console.log(`   • Total jobs processed: ${jobs.length}`);
      console.log(`   • Letters generated successfully: ${successfulLetters}`);
      console.log(`   • Skipped (no email): ${skippedNoEmail}`);
      console.log(`   • Letters saved in: ${this.outputDir}/`);

    } catch (error) {
      console.error('❌ Error generating motivation letters:', error);
    } finally {
      await mongoose.disconnect();
    }
  }
}

// Export classes
module.exports = {
  AusbildungScraperJS,
  GermanMotivationLetterGenerator,
  Ausbildung
};

// CLI usage
if (require.main === module) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('=== Ausbildung.de Scraper & Motivation Letter Generator ===\n');
  console.log('Choose an option:');
  console.log('1. Scrape job listings');
  console.log('2. Generate motivation letters');
  console.log('3. Both (scrape then generate letters)');

  rl.question('Enter your choice (1-3): ', async (choice) => {
    if (choice === '1' || choice === '3') {
      rl.question('Enter job position to search for: ', (position) => {
        rl.question('Enter location (or press Enter to skip): ', async (location) => {
          rl.question('Number of pages to scrape (default 3): ', async (pages) => {
            const numPages = parseInt(pages) || 3;
            
            const scraper = new AusbildungScraperJS(position, location);
            await scraper.startScraping(numPages);
            
            if (choice === '3') {
              rl.question('Enter path to your CV (PDF): ', async (cvPath) => {
                rl.question('Enter your Gemini API key: ', async (apiKey) => {
                  const generator = new GermanMotivationLetterGenerator(apiKey);
                  await generator.generateAllMotivationLetters(cvPath);
                  rl.close();
                });
              });
            } else {
              rl.close();
            }
          });
        });
      });
    } else if (choice === '2') {
      rl.question('Enter path to your CV (PDF): ', (cvPath) => {
        rl.question('Enter your Gemini API key: ', async (apiKey) => {
          const generator = new GermanMotivationLetterGenerator(apiKey);
          await generator.generateAllMotivationLetters(cvPath);
          rl.close();
        });
      });
    } else {
      console.log('Invalid choice');
      rl.close();
    }
  });
}