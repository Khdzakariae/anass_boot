import multer from 'multer';
import nodemailer from 'nodemailer' ;
import path from 'path';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFDocument from'pdfkit';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import config from '../config.js';
import DatabaseManager  from '../db-utils.js';
import jwt from 'jsonwebtoken';


import {
  logger,
  FileManager,
  ValidationHelper,
  RetryHelper,
  TextProcessor,
  ErrorHandler
} from '../utils.js';

const prisma = new PrismaClient();

class DatabaseManagerExtensions {
  // Add this method to your existing DatabaseManager class
  async findDocumentById(documentId) {
    // Implement based on your database structure
    // Example with Prisma:
    return await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        filename: true,
        filePath: true
      }
    });
  }

  // Add this method to your existing DatabaseManager class
  async updateCampaign(campaignId, data) {
    // Implement based on your database structure
    // Example with Prisma:
    return await prisma.emailCampaign.update({
      where: { id: campaignId },
      data
    });
  }
}
// FileManager.ensureDirectory(config.paths.cvUploadsDir);
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, config.paths.cvUploadsDir),
//   filename: (req, file, cb) => cb(null, `cv-${Date.now()}${path.extname(file.originalname)}`)
// });
// const upload = multer({ storage });


export function getUserIdFromToken(req) {
  // console.log('🔍 DEBUG - Headers:', req.headers);
  try {
    let token = null;
    
    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('✅ Token extracted from Authorization header');
      }
    }
    
    if (!token && req.cookies && req.cookies.auth) {
      token = req.cookies.auth;
      console.log('✅ Token extracted from cookie');
    }
    
    if (!token) {
      console.log('❌ No token found in request');
      return null;
    }
    
    console.log('🔍 Token found, attempting to verify...');
    
    const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Debug logging
    console.log('✅ Token verified successfully');
    console.log('🔍 Decoded token:', decoded);
    console.log('🔍 User ID from token:', decoded.id);
    
    if (decoded && decoded.id) {
      const userId = String(decoded.id);
      console.log('✅ Returning userId:', userId);
      return userId;
    } else {
      console.log('❌ No user ID found in decoded token');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    console.error('🔍 Full error:', error);
    return null;
  }
}
export const getUserAusbildungen = async (userId) => {
  const prisma = new PrismaClient();
  try {
    const ausbildungen = await prisma.ausbildung.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }
    });
    return ausbildungen;
  } catch (error) {
    logger.error('Error fetching user ausbildungen:', error);
    throw new Error(`Failed to fetch ausbildungen: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
};

export const getUserAusbildungenByStatus = async (userId, status) => {
  const prisma = new PrismaClient();
  try {
    const ausbildungen = await prisma.ausbildung.findMany({
      where: { 
        userId: userId,
        status: status 
      },
      orderBy: { createdAt: 'desc' }
    });
    return ausbildungen;
  } catch (error) {
    logger.error('Error fetching user ausbildungen by status:', error);
    throw new Error(`Failed to fetch ausbildungen by status: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
};

export const deleteUserAusbildung = async (ausbildungId, userId) => {
  const prisma = new PrismaClient();
  try {
    const deletedAusbildung = await prisma.ausbildung.deleteMany({
      where: {
        id: ausbildungId,
        userId: userId // Ensure user can only delete their own ausbildungen
      }
    });

    if (deletedAusbildung.count === 0) {
      throw new Error(`No ausbildung found with id ${ausbildungId} for user ${userId}`);
    }

    return deletedAusbildung;
  } catch (error) {
    logger.error('Error deleting ausbildung:', error);
    throw new Error(`Failed to delete ausbildung: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
};

export const updateUserAusbildung = async (ausbildungId, userId, updateData) => {
  const prisma = new PrismaClient();
  try {
    const updatedAusbildung = await prisma.ausbildung.updateMany({
      where: {
        id: ausbildungId,
        userId: userId
      },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    if (updatedAusbildung.count === 0) {
      throw new Error(`No ausbildung found with id ${ausbildungId} for user ${userId}`);
    }

    return updatedAusbildung;
  } catch (error) {
    logger.error('Error updating ausbildung:', error);
    throw new Error(`Failed to update ausbildung: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
};

// export const getUserIdFromToken = async (req) => {

//     // console.log(req.headers);

//     // console.log('Extracting user ID from token...');
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       throw { status: 401, message: 'Authorization token missing.' };
//     }

//     const token = authHeader.split(' ')[1];


//     console.log('Token extracted:', token);
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     const userId = decoded.id;
//     console.log('Decoded user ID from token:', userId);
//     if (!userId) {
//       throw { status: 401, message: 'Invalid token.' };
//     }
  
//     const user = await prisma.user.findUnique({ where: { id: userId } });
//     if (!user) {
//       throw { status: 404, message: 'User not found.' };
//     }
  
//     return userId;
// };

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
    constructor(searchTerm, location = '', userId, website = 'ausbildung') {
      console.log('Initializing AusbildungScraperAdvanced with:', { searchTerm, location, userId, website });
      this.searchTerm = encodeURIComponent(searchTerm);
      this.location = encodeURIComponent(location);
      this.website = website;
      this.userId = userId;
      this.dbManager = new DatabaseManager();
      
      // Website-specific configurations
      this.websiteConfigs = {
        ausbildung: {
          baseUrl: 'https://www.ausbildung.de/suche',
          searchParams: (term, loc, page) => `?search=${term}%7C${loc}&radius=500&page=${page}`,
          jobLinkSelector: "a[href^='/stellen/']",
          selectors: {
            title: 'h1',
            company: 'h4[data-testid="jp-customer"], .company-name, [itemprop="hiringOrganization"]',
            location: '[data-testid="jp-branches"], .company-address, .job-location',
            startDate: '[data-testid="jp-starting-at"], .jp-starting-at, .start-date',
            vacancies: '[data-testid="jp-vacancies"], .vacancies, .job-vacancies'
          }
        },
        azubi: {
          baseUrl: 'https://www.azubi.de/ausbildungsplatz',
          searchParams: (term, loc, page) => `?text=${encodeURIComponent(term)}&ort=${encodeURIComponent(loc)}`, // Simple search format
          jobLinkSelector: 'a[href*="/ausbildungsplatz/"][href*="-p-"]', // Updated to match actual pattern
          selectors: {
            title: 'h1, [data-testid="job-title"], .job-title, .ausbildung-title',
            company: '[data-cy="company-name"], .company-name, [data-testid="company-name"], .employer-name, h2, .firma, strong',
            location: '[data-cy="address"], .job-location, [data-cy="location"], .address, .ort, .standort',
            startDate: 'dt:contains("Beginn") + dd, .start-date, [data-cy="start-date"], .ausbildungsbeginn, .beginn',
            vacancies: '.vacancies, [data-cy="vacancies"], .available-positions, .freie-plaetze',
            requirements: '.requirements, [data-cy="requirements"], .voraussetzungen, .anforderungen',
            salary: '.salary, [data-cy="salary"], .gehalt, .vergütung, .ausbildungsvergütung',
            benefits: '.benefits, .leistungen, .vorteile',
            duration: '.duration, .dauer, .ausbildungsdauer'
          }
        }
      };
      
      this.config = this.websiteConfigs[website];
      if (!this.config) {
        throw new Error(`Unsupported website: ${website}. Use 'ausbildung' or 'azubi'.`);
      }
      
      this.browser = null;
      this.page = null;
      this.processedUrls = new Set();
      this.errors = [];
      
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
  
          const title = await this.page.$eval(this.config.selectors.title, el => el.textContent?.trim()).catch(() => 'N/A');
  
          // Extract company/institution with website-specific logic
          let institution = 'N/A';
          if (this.website === 'ausbildung') {
            const instSelectors = this.config.selectors.company.split(', ');
            for (const selector of instSelectors) {
              try {
                institution = await this.page.$eval(selector.trim(), el => {
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
          } else if (this.website === 'azubi') {
            try {
              institution = await this.page.$eval(this.config.selectors.company, el => el.textContent?.trim());
            } catch (_) {}
          }
  
          // Extract location
          const location = await this.extractFieldWithSelectors(
            this.config.selectors.location.split(', '),
            ['Standort', 'Standorte', 'Ort', 'Adresse'],
            'location'
          );
  
          // Extract start date with website-specific logic
          let startDate = 'N/A';
          if (this.website === 'ausbildung') {
            startDate = await this.extractFieldWithSelectors(
              this.config.selectors.startDate.split(', '),
              ['Beginn', 'Ausbildungsbeginn', 'Start', 'Startdatum'],
              'startDate'
            );
  
            if (startDate === 'N/A') {
              logger.info('Start date not found with selectors, trying full-text regex fallback...');
              const plainText = await this.page.evaluate(() => document.body.innerText);
              const datePatterns = [
                /(?:beginn|start|ab)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
                /(?:ausbildungsbeginn)\s*:?\s*(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))/i,
                /\b(\d{1,2}\.\d{1,2}\.(?:2026|2027|2025|2024))\b/
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
          } else if (this.website === 'azubi') {
            try {
              const xpath = `//dt[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'beginn')]/following-sibling::dd[1]`;
              const elements = await this.page.$x(xpath);
              if (elements.length > 0) {
                startDate = await this.page.evaluate(el => el.textContent?.trim(), elements[0]);
              }
            } catch (_) {}
          }
  
          // Extract vacancies
          let vacancies = await this.extractFieldWithSelectors(
            this.config.selectors.vacancies?.split(', ') || [],
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
  
          const pageContent = await this.page.content();
          // More aggressive cleaning for description to avoid database issues
          let description = TextProcessor.cleanHTML(pageContent);
          description = TextProcessor.truncateText(description, 1500); // Shorter limit for database
          
          // Enhanced email extraction - get both from HTML content and plain text
          const emails = TextProcessor.extractEmails(pageContent) || [];
          
          // If no emails found in HTML, try extracting from visible text
          if (emails.length === 0) {
            const plainText = await this.page.evaluate(() => document.body.innerText);
            const plainTextEmails = TextProcessor.extractEmails(plainText) || [];
            emails.push(...plainTextEmails);
          }
          
          // Also try to find emails in specific contact sections
          if (emails.length === 0 && this.website === 'azubi') {
            try {
              // Look for contact information sections
              const contactElements = await this.page.$$eval('*', elements => {
                return elements
                  .filter(el => el.textContent && el.textContent.match(/E-Mail|Email|Kontakt|beratung@|info@/i))
                  .map(el => el.textContent)
                  .join(' ');
              });
              const contactEmails = TextProcessor.extractEmails(contactElements) || [];
              emails.push(...contactEmails);
            } catch (error) {
              logger.warn(`Could not extract contact emails: ${error.message}`);
            }
          }
          
          const phones = TextProcessor.extractPhoneNumbers(pageContent) || [];

          // Extract additional fields for azubi.de
          let requirements = 'N/A';
          let salary = 'N/A';
          let benefits = 'N/A';
          let duration = 'N/A';

          if (this.website === 'azubi') {
            // Extract requirements
            requirements = await this.extractFieldWithSelectors(
              this.config.selectors.requirements?.split(', ') || [],
              ['Voraussetzungen', 'Anforderungen', 'Qualifikationen', 'Requirements'],
              'requirements'
            );

            // Extract salary information
            salary = await this.extractFieldWithSelectors(
              this.config.selectors.salary?.split(', ') || [],
              ['Gehalt', 'Vergütung', 'Ausbildungsvergütung', 'Lohn'],
              'salary'
            );

            // Extract benefits
            benefits = await this.extractFieldWithSelectors(
              this.config.selectors.benefits?.split(', ') || [],
              ['Leistungen', 'Vorteile', 'Benefits'],
              'benefits'
            );

            // Extract duration
            duration = await this.extractFieldWithSelectors(
              this.config.selectors.duration?.split(', ') || [],
              ['Dauer', 'Ausbildungsdauer', 'Duration'],
              'duration'
            );

            // If fields not found with selectors, try regex fallback
            if (requirements === 'N/A' || salary === 'N/A' || duration === 'N/A') {
              const plainText = await this.page.evaluate(() => document.body.innerText);
              
              if (requirements === 'N/A') {
                const reqMatch = plainText.match(/(?:voraussetzungen?|anforderungen?|qualifikationen?)[:\-]?\s*([^.]{20,200})/i);
                if (reqMatch) requirements = reqMatch[1].trim();
              }
              
              if (salary === 'N/A') {
                const salaryMatch = plainText.match(/(?:gehalt|vergütung|lohn)[:\-]?\s*([^.]{10,100})/i);
                if (salaryMatch) salary = salaryMatch[1].trim();
              }
              
              if (duration === 'N/A') {
                const durationMatch = plainText.match(/(?:dauer|ausbildungsdauer)[:\-]?\s*([^.]{5,50})/i);
                if (durationMatch) duration = durationMatch[1].trim();
              }
            }
          }

          const jobData = {
            title,
            institution,
            location,
            start_date: startDate,     // keep snake_case for DB
            vacancies,
            description,
            emails,
            phones,
            url,
            source: this.website, // Add source website info
            // Additional fields for azubi.de
            requirements: this.website === 'azubi' ? requirements : undefined,
            salary: this.website === 'azubi' ? salary : undefined,
            benefits: this.website === 'azubi' ? benefits : undefined,
            duration: this.website === 'azubi' ? duration : undefined
          };          const validation = ValidationHelper.validateJobData(jobData);
          if (!validation.isValid) {
            logger.warn(`Invalid job data for ${url}:`, { errors: validation.errors });
            return null;
          }
  
          logger.success(`Scraped: [Titel: ${jobData.title}] [Firma: ${jobData.institution}] [Start: ${jobData.start_date}] [Plätze: ${jobData.vacancies}] [Source: ${this.website}.de]`);
          return ValidationHelper.sanitizeJobData(jobData);
  
        } catch (error) {
          ErrorHandler.handleScrapingError(error, url);
          throw error;
        }
      }, config.scraping.maxRetries);
    }
  
    async saveToDatabase(jobData) {
        try {
          const prisma = this.dbManager.prisma;
      
          const emails = Array.isArray(jobData.emails) ? jobData.emails.join(", ") : jobData.emails || "";
          // Improved phone number handling
          let phones = "";
          if (Array.isArray(jobData.phones) && jobData.phones.length > 0) {
            // Filter and limit phone numbers to prevent database errors
            const validPhones = jobData.phones
              .map(phone => phone.toString().trim())
              .filter(phone => phone.length <= 20 && phone.length >= 6) // Reasonable phone length
              .slice(0, 3); // Limit to max 3 phone numbers
            phones = validPhones.join(", ");
          }
      
          const existingJob = await prisma.ausbildung.findUnique({
            where: {
              url_userId: { // ✅ compound unique
                url: jobData.url,
                userId: this.userId,
              },
            },
          });
      
          const jobRecord = {
            title: jobData.title,
            institution: jobData.institution,
            location: jobData.location || "N/A",
            startDate: jobData.start_date || "N/A",
            vacancies: jobData.vacancies || "N/A",
            phones,
            description: jobData.description ? jobData.description.substring(0, 2000) : "N/A", // Limit description length
            emails,
            source: jobData.source || this.website, // Add source tracking
            // Include new azubi.de fields if available
            requirements: jobData.requirements || "N/A",
            salary: jobData.salary || "N/A", 
            benefits: jobData.benefits || "N/A",
            duration: jobData.duration || "N/A",
            updatedAt: new Date(),
          };
      
          if (existingJob) {
            await prisma.ausbildung.update({
              where: { url_userId: { url: jobData.url, userId: this.userId } },
              data: jobRecord,
            });
            logger.info(`🔄 Updated existing job: ${jobData.title} from ${this.website}.de`);
          } else {
            await prisma.ausbildung.create({
              data: {
                ...jobRecord,
                url: jobData.url,
                userId: this.userId, // ✅ required link
                createdAt: new Date(),
              },
            });
            logger.success(`💾 Saved new job: ${jobData.title} from ${this.website}.de`);
          }
        } catch (error) {
          // Enhanced error logging for debugging
          logger.error(`Database save error for job: ${jobData?.title || 'Unknown'}`, {
            error: error.message,
            jobData: {
              title: jobData?.title,
              institution: jobData?.institution,
              phones: jobData?.phones,
              phonesLength: jobData?.phones?.length,
              url: jobData?.url
            }
          });
          ErrorHandler.handleDatabaseError(error, "save job");
        }
      }
      
  
      async startScraping(numPages = 3) {
        logger.info('🕷️  Starting scraping process...');
        logger.info(`📋 Configuration: Website: ${this.website}, Search: "${decodeURIComponent(this.searchTerm)}", Location: "${decodeURIComponent(this.location) || 'All Germany'}", Pages: ${numPages}`);
        let totalResults = 0;
        try {
          await this.initializeBrowser();
          await this.dbManager.connect();
    
          const progress = new SimpleProgressTracker(numPages, 'Scraping pages');
    
          for (let page = 1; page <= numPages; page++) {
            logger.info(`\n📄 Processing page ${page}/${numPages}`);
            const searchUrl = `${this.config.baseUrl}${this.config.searchParams(this.searchTerm, this.location, page)}`;
            console.log('Navigating to search URL:', searchUrl);
            try { 
              await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: config.scraping.requestTimeout });
              await this.page.waitForSelector(this.config.jobLinkSelector, { timeout: config.scraping.requestTimeout });
              const jobUrls = await this.page.$$eval(this.config.jobLinkSelector, links =>
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
                  // Only scrape 2026 jobs - skip all other years
                  if (this.website === 'ausbildung' && jobData && jobData.start_date) {
                    if (!jobData.start_date.includes('2026')) {
                      logger.info(`⏭️  Skipping non-2026 job: ${jobData.title} (Start: ${jobData.start_date})`);
                      continue;
                    }
                  }
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

      // Legacy method - scraper now filters for 2026 jobs only
      setSkip2025(skip = true) {
        this.skip2025 = skip; // This property is no longer used in the new filtering logic
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

export { AusbildungScraperAdvanced };

export const addAusbildung = async (req, res) => {
    try {
      const userId = await getUserIdFromToken(req);
      const { title, institution, location, startDate, vacancies, phones, url, description, emails, motivationLetterPath } = req.body;
  
      if (!url) {
        return res.status(400).json({ error: "URL is required." });
      }
  
      const existingAusbildung = await prisma.ausbildung.findUnique({
        where: {
          url_userId: {
            url, 
            userId,   
          }
        }
      });
  
      if (existingAusbildung) {
        return res.status(409).json({ error: 'You already have this Ausbildung saved.', existingAusbildung });
      }
  
      const newAusbildung = await prisma.ausbildung.create({
        data: {
          title,
          institution,
          location: location || 'N/A',
          startDate: startDate || 'N/A',
          vacancies: vacancies || 'N/A',
          phones,
          url,
          description: description || 'N/A',
          emails,
          motivationLetterPath: motivationLetterPath || null,
          userId,
        },
      });
  
      return res.status(201).json({ message: 'Ausbildung added successfully!', data: newAusbildung });
    } catch (error) {
      console.error('Add Ausbildung error:', error);
      const status = error.status || 500;
      return res.status(status).json({ error: error.message || 'Failed to add Ausbildung.' });
    }
};
  
export const getAussbildung = async (req, res) => {
    console.log('Get Ausbildung request received');
    try {
      // Get userId from token instead of URL params
      const userId = await getUserIdFromToken(req);
      console.log('Fetching ausbildungen for user:', userId);
  
      const ausbildungen = await prisma.ausbildung.findMany({
        where: { userId },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
  
      res.json(ausbildungen);
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({ error: error.message || 'Failed to retrieve ausbildungen.' });
    }
};

export const scrapeAusbildung = async (req, res) => {
    try {
      const userId = await getUserIdFromToken(req);
      const { searchTerm, location, numPages, website } = req.body;
  
      if (!searchTerm) {
        return res.status(400).json({ error: "searchTerm is required.", success: false });
      }
      
      // Validate website parameter
      const validWebsites = ['ausbildung', 'azubi'];
      const selectedWebsite = website && validWebsites.includes(website) ? website : 'ausbildung';
  
      logger.info(`🚀 Starting scraping request: ${searchTerm} in ${location || 'All Germany'} from ${selectedWebsite}.de`);
  
      const scraper = new AusbildungScraperAdvanced(searchTerm, location, userId, selectedWebsite);
      const totalResults = await scraper.startScraping(Number(numPages) || 3);
  
      let message = `Scraping completed successfully from ${selectedWebsite}.de.`;
      if (scraper.errors.length > 0) {
        message += ` However, ${scraper.errors.length} errors occurred during the process.`;
        logger.error("Scraping errors encountered:", scraper.errors);
      }
  
      res.status(200).json({
        message,
        savedJobs: totalResults,
        totalProcessedUrls: scraper.processedUrls.size,
        website: selectedWebsite,
        errors: scraper.errors.map(e => ({ url: e.url, page: e.page, error: e.error })),
        success: true,
      });
  
    } catch (error) {
        logger.error(
          "API Scraping Error: " + JSON.stringify({
            type: typeof error,
            isErrorInstance: error instanceof Error,
            error: error?.message || error,
            stack: error?.stack || null,
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
          }, null, 2) // pretty-print JSON
        );
      
        const status = error.status || 500;
        res.status(status).json({
          error: error?.message || "Scraping failed due to an unexpected server error.",
          details: error, // raw error
          success: false,
        });
    }
};

class EmailSender {
  constructor() {
    this.transporter = nodemailer.createTransporter(config.email.smtp);
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

  async sendCampaignEmails({ campaignId, jobIds, documentIds, userName, userEmail }) {
    await this.dbManager.connect();
    try {
      const results = {
        sentCount: 0,
        errors: [],
        messageIds: []
      };

      let additionalAttachments = [];
      if (documentIds && documentIds.length > 0) {
        additionalAttachments = await this.getDocumentAttachments(documentIds);
      }

      for (const jobId of jobIds) {
        try {
          const job = await this.dbManager.findJobById(jobId);
          if (!job) {
            results.errors.push({ jobId, error: `Job with ID ${jobId} not found.` });
            continue;
          }

          if (!job.motivationLetterPath) {
            results.errors.push({ jobId, error: `Motivation letter for job ${jobId} not generated.` });
            continue;
          }

          if (!job.emails || job.emails.length === 0) {
            results.errors.push({ jobId, error: `No recipient email for job ${jobId}.` });
            continue;
          }

          const attachments = [
            { 
              filename: `Bewerbung_${userName}.pdf`, 
              path: job.motivationLetterPath 
            },
            ...additionalAttachments
          ];

          const mailOptions = {
            from: config.email.fromAddress,
            to: job.emails.join(', '),
            subject: `Bewerbung: ${job.title} - ${userName}`,
            html: `<p>Sehr geehrte Damen und Herren,</p>
                   <p>anbei übersende ich Ihnen meine Bewerbungsunterlagen für die Ausbildungsstelle als <strong>${job.title}</strong>.</p>
                   <p>Mit freundlichen Grüßen,</p>
                   <p><strong>${userName}</strong><br><i>${userEmail}</i></p>`,
            attachments
          };

          const info = await this.transporter.sendMail(mailOptions);
          await this.dbManager.updateJobStatus(jobId, 'Applied');
          
          results.sentCount++;
          results.messageIds.push({ jobId, messageId: info.messageId });
          
          logger.success(`Campaign ${campaignId}: Email sent for job ${jobId} to ${mailOptions.to}. Message ID: ${info.messageId}`);

        } catch (error) {
          results.errors.push({ jobId, error: error.message });
          logger.error(`Campaign ${campaignId}: Failed to send email for job ${jobId}:`, error);
        }
      }

      await this.updateCampaignResults(campaignId, results);

      return results;
    } finally {
      await this.dbManager.disconnect();
    }
  }

  async getDocumentAttachments(documentIds) {
    const attachments = [];
    for (const docId of documentIds) {
      try {
        const document = await this.dbManager.findDocumentById(docId);
        if (document && document.filePath) {
          attachments.push({
            filename: document.filename || `document_${docId}.pdf`,
            path: document.filePath
          });
        }
      } catch (error) {
        logger.warn(`Failed to load document ${docId}:`, error);
      }
    }
    return attachments;
  }

  async updateCampaignResults(campaignId, results) {
    try {
      await this.dbManager.updateCampaign(campaignId, {
        sentCount: results.sentCount,
        errorCount: results.errors.length,
        completedAt: new Date(),
        status: results.errors.length === 0 ? 'completed' : 'completed_with_errors'
      });
    } catch (error) {
      logger.error(`Failed to update campaign ${campaignId} results:`, error);
    }
  }
}

export const sendEmail = async (req, res) => {
  const { jobId, userName, userEmail } = req.body;

  if (!jobId || !userName || !userEmail) {
    return res
      .status(400)
      .json({ error: "jobId, userName, and userEmail are required." });
  }

  try {
    // Optional: Verify that the job belongs to the authenticated user
    const userId = await getUserIdFromToken(req);
    const job = await prisma.ausbildung.findFirst({
      where: { id: jobId, userId }
    });

    if (!job) {
      return res.status(404).json({
        error: "Job not found or you don't have permission to access it."
      });
    }

    const emailSender = new EmailSender();
    const result = await emailSender.sendApplicationEmail({
      jobId,
      userName,
      userEmail,
    });

    res
      .status(200)
      .json({ message: "Email sent successfully!", ...result, success: true });
  } catch (error) {
    logger.error("API Email Sending Error:", {
      error: error.message,
      stack: error.stack,
    });
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || "Failed to send email.",
      success: false,
    });
  }
};

export const sendCampaignEmails = async (req, res) => {

  console.log("req.body:", req.body);


  config.logging.level = 'info'; // Set to 'debug' for more verbosity


  const { campaignId } = req.params;
  const userId = getUserIdFromToken(req);

  // --- ADD THESE LOGS ---
  logger.info(`Attempting to send emails for campaign: ${campaignId}`);
  logger.info(`Logged-in user ID: ${userId}`);
  // --- END LOGS ---

  if (!userId) {
    logger.warn("Unauthorized access attempt: User ID is null.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Ensure campaignId is not undefined or null
  if (!campaignId) {
    logger.warn("Bad request: Campaign ID is missing from parameters.");
    return res.status(400).json({ error: "Campaign ID is required." });
  }

  const campaign = await prisma.emailCampaign.findUnique({
    where: {
      id: campaignId,
      userId: userId, // This is the critical ownership check
    },
  });

  if (!campaign) {
    logger.error(`Campaign not found or unauthorized: campaignId=${campaignId}, userId=${userId}`);
    return res.status(404).json({
      error: "Campaign not found or you don't have permission to access it.",
    });
  }


  
  // Update campaign status to "sending"
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending' }
  });

  try {
    // 2. Parse the stored JSON strings back into arrays
    const jobIds = JSON.parse(campaign.jobIds || '[]');
    const documentIds = JSON.parse(campaign.documentIds || '[]');

    // 3. Fetch all required data from the DB in advance
    const jobsToSend = await prisma.ausbildung.findMany({
      where: { id: { in: jobIds }, userId: userId },
    });

    const userDocuments = await prisma.document.findMany({
      where: { id: { in: documentIds }, userId: userId },
    });

    // 4. Prepare the list of general attachments (CVs, certificates, etc.)
    const generalAttachments = userDocuments.map(doc => ({
      filename: doc.originalName, // The original filename for the recipient
      path: doc.filePath,        // The path on your server
    }));
    
    let sentCount = 0;
    let errorCount = 0;

    // 5. Loop through each job to send a tailored email
    for (const job of jobsToSend) {
      try {
        const recipientEmail = JSON.parse(job.emails || '[]')[0];
        if (!recipientEmail) {
          logger.warn(`Job ${job.id} has no email address. Skipping.`);
          errorCount++;
          continue;
        }

        let finalAttachments = [...generalAttachments];

        // Add the specific motivation letter for THIS job
        if (job.motivationLetterPath) {
          finalAttachments.push({
            filename: `Anschreiben - ${job.title}.pdf`, // A professional filename
            path: job.motivationLetterPath,
          });
        }
        
        const mailOptions = {
          to: recipientEmail,
          subject: `Bewerbung um einen Ausbildungsplatz als ${job.title}`,
          html: `
            <p>Sehr geehrte Damen und Herren,</p>
            <p>anbei erhalten Sie meine Bewerbungsunterlagen für die Ausbildungsstelle als ${job.title}.</p>
            <p>Mit freundlichen Grüßen,</p>
            <p>[Your Name]</p> 
          `, // You can make this more dynamic
          attachments: finalAttachments,
        };

        await sendEmailWithAttachments(mailOptions);
        sentCount++;

      } catch (emailError) {
        logger.error(`Failed to send email for job ${job.id}:`, emailError);
        errorCount++;
      }
    }
    
    // 6. Update the campaign with the final status and counts
    await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
            status: errorCount > 0 ? 'completed_with_errors' : 'completed',
            sentCount,
            errorCount,
            completedAt: new Date()
        }
    });

    res.status(200).json({ 
        message: 'Campaign processing finished.',
        sent: sentCount,
        failed: errorCount 
    });

  } catch (error) {
    logger.error("Critical error during campaign sending:", error);
    // Revert status to 'failed' on critical error
    await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'failed' }
    });
    res.status(500).json({ error: 'A critical error occurred.' });
  }
};

export const getStats = async (req, res) => {
    try {
      const userId = await getUserIdFromToken(req);
      
      const totalJobs = await prisma.ausbildung.count({
        where: { userId }
      });
  
      // Count jobs with motivation letters for this specific user
      const jobsWithMotivationLetters = await prisma.ausbildung.count({
        where: { 
          userId,
          motivationLetterPath: { not: null } 
        },
      });
  
      const formattedStats = {
        totalJobs,
        jobsWithMotivationLetters,
      };
  
      res.json(formattedStats);
    } catch (error) {
      logger.error("API Error in GET /api/stats:", { details: error.message });
      const status = error.status || 500;
      res.status(status).json({
        error: error.message || "Failed to retrieve stats.",
      });
    }
};

export const deleteAusbildung = async (req, res) => {
    try {
      const userId = await getUserIdFromToken(req);
      const { id } = req.params;
  
      const ausbildung = await prisma.ausbildung.findFirst({ where: { id, userId } });
      if (!ausbildung) return res.status(404).json({ error: 'Ausbildung not found or permission denied.' });
  
      await prisma.ausbildung.delete({ where: { id } });
      res.status(200).json({ message: 'Ausbildung deleted successfully.' });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({ error: error.message || 'Failed to delete Ausbildung.' });
    }
};

export const deleteAllAusbildung2025 = async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Delete all Ausbildung records for 2025 for the authenticated user
    const deleted = await prisma.ausbildung.deleteMany({
      where: {
        AND: [
          { userId: userId }, // Only delete user's own records
          {
            OR: [
              { startDate: { contains: '2025' } },
              { startDate: { contains: '.2025' } },
              { startDate: { contains: '/2025' } },
              { startDate: { contains: '-2025' } }
            ]
          }
        ]
      },
    });

    logger.info(`User ${userId} deleted ${deleted.count} Ausbildung records for 2025`);
    res.status(200).json({ 
      message: `Successfully deleted ${deleted.count} Ausbildung records for 2025.`,
      count: deleted.count,
      success: true
    });
  } catch (error) {
    logger.error("Delete All Ausbildung 2025 Error:", error);
    res.status(500).json({
      error: "Failed to delete Ausbildung records for 2025.",
      success: false,
    });
  }
};


export const createCampaign = async (req, res) => {
  const { name, sendType, jobIds, documentIds, totalEmails } = req.body;

  if (!name || !jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({ 
      error: "Campaign name and a non-empty array of jobIds are required." 
    });
  }

  try {
    const userId = getUserIdFromToken(req); // Assuming this returns a valid string ID
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: Invalid token." });
    }

    // Optional: Verify that the user owns the jobs (your existing logic is good)
    const jobs = await prisma.ausbildung.findMany({
      where: { id: { in: jobIds }, userId },
      select: { id: true }
    });

    if (jobs.length !== jobIds.length) {
      return res.status(403).json({
        error: "Forbidden: Some job IDs are invalid or do not belong to you."
      });
    }

    // Create the campaign
    const campaign = await prisma.emailCampaign.create({
      data: {
        name: name.trim(),
        userId,
        sendType: sendType || 'all',
        
        // ✅ FIX: Serialize the arrays into JSON strings before saving
        jobIds: JSON.stringify(jobIds),
        documentIds: JSON.stringify(documentIds || []),

        totalEmails: totalEmails || jobIds.length,
        status: 'created',
      }
    });

    res.status(201).json({
      message: "Campaign created successfully!",
      campaign,
    });

  } catch (error) {
    logger.error("API Campaign Creation Error:", {
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      error: "An internal error occurred while creating the campaign.",
      success: false,
    });
  }
};

export const getCampaigns = async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);

    const campaigns = await prisma.emailCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
    
    

    res.status(200).json(campaigns);

  } catch (error) {
    logger.error("API Get Campaigns Error:", error);
    res.status(500).json({
      error: "Failed to fetch campaigns.",
      success: false,
    });
  }
};

export const updateCampaignStatus = async (req, res) => {
  const { campaignId } = req.params;
  const { status, sentCount, errorCount, completedAt } = req.body;

  if (!status) {
    return res.status(400).json({ 
      error: "Status is required." 
    });
  }

  try {
    const userId = await getUserIdFromToken(req);

    // Verify campaign belongs to user
    const campaign = await prisma.emailCampaign.findFirst({
      where: { 
        id: campaignId, 
        userId 
      }
    });

    if (!campaign) {
      return res.status(404).json({
        error: "Campaign not found or you don't have permission to access it."
      });
    }

    // Update the campaign
    const updateData = {
      status,
      updatedAt: new Date()
    };

    if (sentCount !== undefined) updateData.sentCount = sentCount;
    if (errorCount !== undefined) updateData.errorCount = errorCount;
    if (completedAt) updateData.completedAt = new Date(completedAt);
    if (status === 'completed' || status === 'completed_with_errors' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    const updatedCampaign = await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: updateData
    });

    res.status(200).json({
      message: "Campaign status updated successfully!",
      ...updatedCampaign
    });

  } catch (error) {
    logger.error("API Update Campaign Status Error:", error);
    res.status(500).json({
      error: "Failed to update campaign status.",
      success: false,
    });
  }
};

export const getDocuments = async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req);

    const documents = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        originalName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true
      }
    });

    res.status(200).json(documents);

  } catch (error) {
    logger.error("API Get Documents Error:", error);
    res.status(500).json({
      error: "Failed to fetch documents.",
      success: false,
    });
  }
};


