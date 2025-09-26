// app.js — API Server Entry Point (fixed)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
const pdf = require('pdf-parse');
const fs = require('fs');
const { AuthService } = require('./services/AuthService'); // Adjust path if needed
const { protect } = require('./middleware/auth'); // Adjust path if needed
const config = require('./config');
const { DatabaseManager } = require('./db-utils');
const authService = new AuthService(); // Instantiate the auth service

const {
  logger,
  FileManager,
  ValidationHelper,
  RetryHelper,
  DateHelper,
  TextProcessor,
  ErrorHandler
} = require('./utils');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (typeof logger.debug !== 'function') {
  logger.debug = (...args) => logger.info(...args);
}

class SimpleProgressTracker {
  constructor(total, description = 'Progress') {
    this.total = total || 0;
    this.current = 0;
    this.description = description;
    this.start = Date.now();
  }
  increment() {
    this.current++;
    const pct = this.total ? Math.round((this.current / this.total) * 100) : 0;
    const sec = Math.round((Date.now() - this.start) / 1000);
    logger.info(`📊 ${this.description}: ${this.current}/${this.total} (${pct}%) — ${sec}s`);
  }
  complete() {
    const sec = Math.round((Date.now() - this.start) / 1000);
    logger.success(`✅ ${this.description} completed: ${this.current}/${this.total} in ${sec}s`);
  }
}

class AusbildungScraperAdvanced {
  constructor(searchTerm, location = '') {
    this.searchTerm = encodeURIComponent(searchTerm);
    this.location = encodeURIComponent(location);
    this.baseUrl = config.scraping.baseUrl;
    this.browser = null;
    this.page = null;
    this.processedUrls = new Set();
    this.errors = [];
    this.dbManager = new DatabaseManager();
    // fire-and-forget is fine (dirs not critical for scraping)
    this.initializeDirectories();
  }

  async initializeDirectories() {
    const directories = Object.values(config.paths);
    for (const dir of directories) {
      await FileManager.ensureDirectory(dir);
    }
  }

  async initializeBrowser() {
    logger.info('🚀 Initializing browser...');
    try {
      // ensure robust defaults
      const launchOpts = {
        ...config.scraping.puppeteerOptions,
        args: [
          ...(config.scraping.puppeteerOptions?.args || []),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      };
      this.browser = await puppeteer.launch(launchOpts);
      this.page = await this.browser.newPage();

      if (config.scraping.userAgent) {
        await this.page.setUserAgent(config.scraping.userAgent);
      }
      if (config.scraping.puppeteerOptions?.defaultViewport) {
        await this.page.setViewport(config.scraping.puppeteerOptions.defaultViewport);
      }

      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      logger.success('Browser initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize browser:', { error: error.message });
      throw error;
    }
  }

  async extractFieldWithSelectors(selectors, labelTexts = [], debugName = null) {
    try {
      for (const selector of selectors) {
        try {
          const text = await this.page.$eval(selector, el => el.textContent?.trim());
          if (text) return ValidationHelper.sanitizeString(text);
        } catch (_) { /* keep trying */ }
      }
      for (const label of labelTexts) {
        try {
          const xpath = `//dt[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${label.toLowerCase()}')]/following-sibling::dd[1]`;
          const nodes = await this.page.$x(xpath);
          if (nodes.length > 0) {
            const text = await this.page.evaluate(el => el.textContent?.trim(), nodes[0]);
            if (text) return ValidationHelper.sanitizeString(text);
          }
        } catch (_) { /* keep trying */ }
      }
      return 'N/A';
    } catch (error) {
      logger.error(`Error extracting field${debugName ? ` (${debugName})` : ''}:`, { error: error.message });
      return 'N/A';
    }
  }

  async scrapeJobDetails(url) {
    return await RetryHelper.withRetry(async () => {
      logger.info(`Processing: ${url}`);
      try {
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: config.scraping.requestTimeout });

        const title = await this.page.$eval('h1', el => el.textContent?.trim()).catch(() => 'N/A');


        // institution via multiple selectors + URL inference fallback
        let institution = 'N/A';
        const instSelectors = [
          'h4[data-testid="jp-customer"]',
          '.company-name',
          '[itemprop="hiringOrganization"]'
        ];
        for (const selector of instSelectors) {
          try {
            institution = await this.page.$eval(selector, el => {
              const text = el.textContent?.trim() || '';
              return text.toLowerCase().startsWith('bei ') ? text.substring(4) : text;
            });
            if (institution && institution !== 'N/A') break;
          } catch (_) {}
        }
        if (institution === 'N/A' || institution.length < 2) {
          const urlMatch = url.match(/bei-(.*?)-in-/);
          if (urlMatch) {
            institution = urlMatch[1]
              .replace(/-/g, ' ')
              .replace(/\b\w/g, l => l.toUpperCase());
          }
        }

        // location
        const location = await this.extractFieldWithSelectors(
          ['[data-testid="jp-branches"]', '.company-address', '.job-location', '[class*="location"]', '[class*="address"]', '[class*="standort"]'],
          ['Standort', 'Standorte', 'Ort', 'Adresse'],
          'location'
        );

        // start date + regex fallback
        let startDate = await this.extractFieldWithSelectors(
          ['[data-testid="jp-starting-at"]', '.jp-starting-at', '.start-date', '[class*="start"]', '[class*="begin"]'],
          ['Beginn', 'Ausbildungsbeginn', 'Start', 'Startdatum'],
          'startDate'
        );

        if (startDate === 'N/A') {
          logger.info('Start date not found with selectors, trying full-text regex fallback...');
          const plainText = await this.page.evaluate(() => document.body.innerText);
          const datePatterns = [
            /(?:beginn|start|ab)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
            /(?:ausbildungsbeginn)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
            /\b(\d{1,2}\.\d{1,2}\.(?:2024|2025|2026|2027))\b/
          ];
          for (const pattern of datePatterns) {
            const match = plainText.match(pattern);
            if (match && match[1]) {
              startDate = match[1];
              logger.info(`Found start date with regex: ${startDate}`);
              break;
            }
          }
        }

        // vacancies + regex fallback
        let vacancies = await this.extractFieldWithSelectors(
          ['[data-testid="jp-vacancies"]', '.vacancies', '.job-vacancies', '[class*="platz"]', '[class*="vacan"]'],
          ['Freie Plätze', 'Plätze', 'Anzahl', 'Stellen'],
          'vacancies'
        );

        if (vacancies === 'N/A') {
          logger.info('Vacancies not found with selectors, trying full-text regex fallback...');
          const plainText = await this.page.evaluate(() => document.body.innerText);
          const vacancyMatch = plainText.match(/(\d+)\s*(?:freie?\s*)?(?:plätze?|stelle[n]?)/i);
          if (vacancyMatch && vacancyMatch[1]) {
            vacancies = vacancyMatch[1];
            logger.info(`Found vacancies with regex: ${vacancies}`);
          }
        }

        // description + contacts
        const pageContent = await this.page.content();
        const description = TextProcessor.truncateText(TextProcessor.cleanHTML(pageContent), 1000);
        const emails = TextProcessor.extractEmails(pageContent) || [];
        const phones = TextProcessor.extractPhoneNumbers(pageContent) || [];

        const jobData = {
          title,
          institution,
          location,
          start_date: startDate,     // keep snake_case for DB
          vacancies,
          description,
          emails,
          phones,
          url
        };

        const validation = ValidationHelper.validateJobData(jobData);
        if (!validation.isValid) {
          logger.warn(`Invalid job data for ${url}:`, { errors: validation.errors });
          return null;
        }

        logger.success(`Scraped: [Titel: ${jobData.title}] [Firma: ${jobData.institution}] [Start: ${jobData.start_date}] [Plätze: ${jobData.vacancies}]`);
        return ValidationHelper.sanitizeJobData(jobData);

      } catch (error) {
        ErrorHandler.handleScrapingError(error, url);
        throw error;
      }
    }, config.scraping.maxRetries);
  }

  async saveToDatabase(jobData) {
    try {
      const existingJob = await this.dbManager.findJobByUrl(jobData.url);
      if (existingJob) {
        await this.dbManager.updateJobByUrl(jobData.url, jobData);
        logger.info(`Updated existing job: ${jobData.title}`);
      } else {
        await this.dbManager.createJob(jobData);
        logger.success(`Saved new job: ${jobData.title}`);
      }
    } catch (error) {
      ErrorHandler.handleDatabaseError(error, 'save job');
    }
  }

  async startScraping(numPages = 3) {
    logger.info('🕷️  Starting scraping process...');
    let totalResults = 0;
    try {
      await this.initializeBrowser();
      await this.dbManager.connect();

      const progress = new SimpleProgressTracker(numPages, 'Scraping pages');

      for (let page = 1; page <= numPages; page++) {
        logger.info(`\n📄 Processing page ${page}/${numPages}`);
        const searchUrl = `${this.baseUrl}?search=${this.searchTerm}&location=${this.location}&page=${page}`;
        try {
          await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: config.scraping.requestTimeout });
          await this.page.waitForSelector("a[href^='/stellen/']", { timeout: config.scraping.requestTimeout });
          const jobUrls = await this.page.$$eval("a[href^='/stellen/']", links =>
            [...new Set(links.map(link => link.href))]
          );
          logger.info(`Found ${jobUrls.length} job listings on page ${page}`);
          if (jobUrls.length === 0) break;

          let pageResults = 0;
          for (const jobUrl of jobUrls) {
            if (this.processedUrls.has(jobUrl)) continue;
            this.processedUrls.add(jobUrl);

            try {
              const jobData = await this.scrapeJobDetails(jobUrl);
              if (jobData && jobData.emails && jobData.emails.length > 0) {
                await this.saveToDatabase(jobData);
                totalResults++;
                pageResults++;
              } else if (jobData) {
                logger.warn(`⏭️  Skipping job (no email found): ${jobData.title}`);
              }
            } catch (error) {
              logger.error(`Failed to process job: ${jobUrl}`, { error: error.message });
              this.errors.push({ url: jobUrl, error: error.message });
            }
            await RetryHelper.sleep(config.scraping.delayBetweenRequests);
          }
          logger.info(`📈 Page ${page} results: ${pageResults} jobs saved with emails`);
        } catch (error) {
          logger.error(`Error processing page ${page}:`, { error: error.message });
          this.errors.push({ page, error: error.message });
        }
        progress.increment();
        if (page < numPages) await RetryHelper.sleep(config.scraping.delayBetweenPages);
      }

      progress.complete();
      logger.success(`✅ Scraping completed successfully!`);
      logger.info(`📊 Final Results:\n   • Total jobs saved with email: ${totalResults}\n   • Total URLs processed: ${this.processedUrls.size}\n   • Total errors encountered: ${this.errors.length}`);
      if (this.errors.length > 0) {
        logger.warn(`❗ Errors summary:`);
        this.errors.slice(0, 5).forEach((e, i) => {
          logger.warn(`   ${i + 1}. ${e.url || `Page ${e.page}`}: ${e.error}`);
        });
        if (this.errors.length > 5) {
          logger.warn(`   ... and ${this.errors.length - 5} more errors`);
        }
      }
    } catch (error) {
      logger.error('Critical scraping error:', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      await this.cleanup();
    }
    return totalResults;
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info('Browser closed successfully');
      }
      await this.dbManager.disconnect();
      logger.info('Database connection closed successfully');
    } catch (error) {
      logger.error('Error during cleanup:', { error: error.message });
    }
  }
}

class AdvancedMotivationLetterGenerator {
  constructor() {
    this.apiKey = config.apis.geminiApiKey;
    if (!this.apiKey || this.apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      throw new Error('Missing Gemini API key.');
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.apis.geminiModel });
    this.dbManager = new DatabaseManager();
  }

  async generateAllMotivationLetters(cvPath) {
    logger.info('📝 Starting motivation letter generation...');
    let successCount = 0;
    try {
      await FileManager.ensureDirectory(config.paths.outputDir);
      const cvText = await this.extractCVText(cvPath);
      await this.dbManager.connect();
      const jobs = await this.dbManager.findJobsWithoutMotivationLetter();
      logger.info(`📊 Found ${jobs.length} jobs that need letters.`);
      const progress = new SimpleProgressTracker(jobs.length, 'Generating motivation letters');

      for (const job of jobs) {
        try {
          const letterText = await this.generateLetterText(job, cvText);
          const filename = `Bewerbung_${FileManager.cleanFilename(job.institution)}_${job.id}.pdf`;
          const filepath = path.join(config.paths.outputDir, filename);
          await this.createPDF(letterText, filepath, job.title, job.institution);
          await this.dbManager.updateMotivationLetterPath(job.id, filepath);
          await this.dbManager.updateJobStatus(job.id, 'Ready to Send');
          logger.success(`✅ Letter created for ${job.institution}`);
          successCount++;
        } catch (error) {
          logger.error(`❌ Failed to process a letter for ${job.institution}:`, { error: error.message });
        }
        progress.increment();
        await RetryHelper.sleep(config.letterGeneration.delayBetweenGenerations);
      }
      progress.complete();
    } catch (error) {
      logger.error('Critical error during letter generation:', { error: error.message, stack: error.stack });
    } finally {
      await this.dbManager.disconnect();
      logger.info('Letter generation process finished.');
    }
    return successCount;
  }

  async extractCVText(cvPath) {
    try {
      if (!await FileManager.fileExists(cvPath)) {
        throw new Error(`CV file not found at path: ${cvPath}`);
      }
      const dataBuffer = fs.readFileSync(cvPath);
      const data = await pdf(dataBuffer);
      logger.success(`CV parsed successfully. Character count: ${data.text.trim().length}`);
      return data.text.trim();
    } catch (error) {
      logger.error(`Failed during CV extraction: ${error.message}`);
      throw new Error(`Failed to read or parse the PDF file. Details: ${error.message}`);
    }
  }

  async generateLetterText(jobInfo, cvText) {
    return await RetryHelper.withRetry(async () => {
      // FIX: DB field is start_date, not startDate
      const { title, institution, description, location, start_date } = jobInfo;
      const context = `Ausbildungsposition: ${title}\nStandort: ${location}\nAusbildungsbeginn: ${start_date || 'N.N.'}`;
      const prompt =
        `Ich bewerbe mich um eine Ausbildung bei "${institution}".\n\n` +
        `Stellenausschreibung:\n${context}\n\n` +
        `Stellenbeschreibung: ${description}\n\n` +
        `Mein Lebenslauf:\n${cvText}\n\n` +
        `Bitte verfasse ein professionelles Bewerbungsschreiben. Anforderungen: Deutsch, 300-450 Wörter, ` +
        `professioneller Ton, auf die Ausbildung und Firma zugeschnitten. Beginne mit "Bewerbung um einen Ausbildungsplatz als..." ` +
        `und schließe mit "Mit freundlichen Grüßen".`;
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    });
  }

  async createPDF(letterText, filename, jobTitle, company) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margins: config.pdf.pageMargins });
      const stream = fs.createWriteStream(filename);
      doc.pipe(stream);
      doc.fontSize(14).font('Helvetica-Bold').text(`Bewerbung: ${jobTitle}`, { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`bei ${company}`, { align: 'center' }).moveDown(2);
      doc.fontSize(config.pdf.fontSize).font(config.pdf.fontFamily);
      letterText.split('\n').forEach(line => doc.text(line, { align: 'left' }));
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}

class EmailSender {
  constructor() {
    // FIX: createTransport, not createTransporter
    this.transporter = nodemailer.createTransport(config.email.smtp);
    this.dbManager = new DatabaseManager();
  }

  async sendApplicationEmail({ jobId, userName, userEmail }) {
    await this.dbManager.connect();
    try {
      const job = await this.dbManager.findJobById(jobId);
      if (!job) throw new Error(`Job with ID ${jobId} not found.`);
      if (!job.motivationLetterPath) throw new Error(`Motivation letter for job ${jobId} not generated.`);
      if (!job.emails || job.emails.length === 0) throw new Error(`No recipient email for job ${jobId}.`);

      const mailOptions = {
        from: config.email.fromAddress,
        to: job.emails.join(', '),
        subject: `Bewerbung: ${job.title} - ${userName}`,
        html: `<p>Sehr geehrte Damen und Herren,</p>
               <p>anbei übersende ich Ihnen meine Bewerbungsunterlagen für die Ausbildungsstelle als <strong>${job.title}</strong>.</p>
               <p>Mit freundlichen Grüßen,</p>
               <p><strong>${userName}</strong><br><i>${userEmail}</i></p>`,
        attachments: [{ filename: `Bewerbung_${userName}.pdf`, path: job.motivationLetterPath }]
      };
      const info = await this.transporter.sendMail(mailOptions);
      await this.dbManager.updateJobStatus(jobId, 'Applied');
      logger.success(`Email sent to ${mailOptions.to}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } finally {
      await this.dbManager.disconnect();
    }
  }
}


FileManager.ensureDirectory(config.paths.cvUploadsDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.cvUploadsDir),
  filename: (req, file, cb) => cb(null, `cv-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });


app.get('/', (req, res) => res.send('Ausbildung Scraper API is running!'));


app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const user = await authService.registerUser(email, password, name);
    // After successful registration, log in the user and return a token
    const { token } = await authService.loginUser(email, password);
    res.status(201).json({
      message: 'User registered successfully!',
      user: { id: user.id, email: user.email, name: user.name },
      token,
      success: true
    });
  } catch (error) {
    logger.error('Signup API Error:', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message, success: false });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { user, token } = await authService.loginUser(email, password);
    res.status(200).json({
      message: 'Logged in successfully!',
      user,
      token,
      success: true
    });
  } catch (error) {
    logger.error('Login API Error:', { error: error.message, stack: error.stack });
    res.status(401).json({ error: error.message, success: false });
  }
});

// Logout is typically handled client-side by deleting the token.
// However, you can optionally have a backend endpoint if you want to invalidate tokens (more complex).
// For stateless JWTs, simply discarding the token client-side is sufficient.
app.post('/api/auth/logout', protect, (req, res) => {
  // If using stateless JWTs, no server-side action is strictly needed.
  // This endpoint primarily serves as a confirmation and a place for future server-side token invalidation
  // if you were to implement a blacklist or refresh tokens.
  logger.info(`User ${req.user.email} logged out (token discarded client-side).`);
  res.status(200).json({ message: 'Logged out successfully (token discarded).', success: true });
});

app.post('/api/scrape', async (req, res) => {
  const { searchTerm, location, numPages } = req.body;
  if (!searchTerm) return res.status(400).json({ error: 'searchTerm is required.' });
  try {
    const scraper = new AusbildungScraperAdvanced(searchTerm, location, userId);
    const savedJobs = await scraper.startScraping(Number(numPages) || 3);
    res.status(200).json({ message: 'Scraping completed successfully.', savedJobs, success: true });
  } catch (error) {
    logger.error('API Scraping Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Scraping failed.', details: error.message, success: false });
  }
});

app.post('/api/generate-letters', upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CV file upload is required.' });
  try {
    const generator = new AdvancedMotivationLetterGenerator();
    const generatedCount = await generator.generateAllMotivationLetters(req.file.path);
    res.status(200).json({ message: 'Letter generation completed successfully.', generatedCount, success: true });
  } catch (error) {
    logger.error('API Letter Generation Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Letter generation failed.', details: error.message, success: false });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { jobId, userName, userEmail } = req.body;
  if (!jobId || !userName || !userEmail) {
    return res.status(400).json({ error: 'jobId, userName, and userEmail are required.' });
  }
  try {
    const emailSender = new EmailSender();
    const result = await emailSender.sendApplicationEmail({ jobId, userName, userEmail });
    res.status(200).json({ message: 'Email sent successfully!', ...result, success: true });
  } catch (error) {
    logger.error('API Email Sending Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to send email.', details: error.message, success: false });
  }
});

app.get('/api/jobs', async (req, res) => {
  const dbManager = new DatabaseManager();
  try {
      await dbManager.connect();
      const jobs = await dbManager.findAllJobs();

      // 🔑 Normalize job fields for frontend
      const formattedJobs = jobs.map(job => ({
          id: job.id,
          title: job.title || "N/A",
          institution: job.institution || "N/A",
          location: job.location || "N/A",
          startDate: job.startDate || "N/A",   // rename for frontend
          url: job.url,
          motivationLetterPath: job.motivationLetterPath || null,
          emailSent: job.status === 'Applied', // frontend expects boolean
          status: job.status || "Pending"      // optional explicit field
      }));

      res.json(formattedJobs);
  } catch (error) {
      logger.error('API Error in /api/jobs:', { details: error.message });
      res.status(500).json({ error: 'Failed to retrieve jobs.', details: error.message });
  } finally {
      await dbManager.disconnect();
  }
});

app.get('/api/stats', async (req, res) => {
  const dbManager = new DatabaseManager();
  try {
      await dbManager.connect();
      const stats = await dbManager.getJobStats();

      // 🔑 Normalize for frontend expectations
      const formattedStats = {
          totalJobs: stats.totalJobs || 0,
          jobsWithMotivationLetters: stats.jobsWithMotivationLetters || 0
      };

      res.json(formattedStats);
  } catch (error) {
      logger.error('API Error in /api/stats:', { details: error.message });
      res.status(500).json({ error: 'Failed to retrieve stats.', details: error.message });
  } finally {
      await dbManager.disconnect();
  }
});

const PORT = config.app.port;
app.listen(PORT, () => {
  logger.success(`🚀 API Server is running on http://localhost:${PORT}`);
});
