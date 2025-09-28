import fs from "fs";
import path from "path";
import config from "./config.js";

export class Logger {
  constructor() {
    this.logDir = config.paths.logsDir;
    this.initializeLogDirectory();
  }

  async initializeLogDirectory() {
    try {
      await fs.promises.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error("Error creating log directory:", error);
    }
  }

  
  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    return JSON.stringify({ timestamp, level: level.toUpperCase(), message, ...metadata });
  }

  async writeToFile(level, message, metadata = {}) {
    if (!config.logging.enableFileLogging) return;
    try {
      const filename = `${new Date().toISOString().split("T")[0]}.log`;
      const filepath = path.join(this.logDir, filename);
      const logMessage = this.formatMessage(level, message, metadata) + "\n";
      await fs.promises.appendFile(filepath, logMessage);
    } catch (error) {
      console.error("Error writing to log file:", error);
    }
  }

// Replace the existing log method with this one
log(level, message, metadata = {}) {
  const formattedMessage = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (config.logging.enableConsoleLogging) {
    const colorMap = { error: "🔴", warn: "🟡", success: "🟢", info: "ℹ️" };
    console.log(`${colorMap[level] || "ℹ️"} ${formattedMessage}`);

    // This new part will print the full error details to the console
    if (metadata && Object.keys(metadata).length > 0) {
      console.dir(metadata, { depth: null, colors: true });
    }
  }
  this.writeToFile(level, message, metadata);
}

  info(message, metadata = {}) { this.log("info", message, metadata); }
  error(message, metadata = {}) { this.log("error", message, metadata); }
  warn(message, metadata = {}) { this.log("warn", message, metadata); }
  success(message, metadata = {}) { this.log("success", message, metadata); }
}

export const logger = new Logger();

export class FileManager {
  static async ensureDirectory(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      logger.error(`Error creating directory ${dirPath}:`, { error: error.message });
    }
  }

  static async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static cleanFilename(filename) {
    return filename
      .replace(/[^\w\s-]/g, '')
      .replace(/[-\s]+/g, '_')
      .substring(0, 50);
  }
}

export class ValidationHelper {
  static isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(String(email).toLowerCase());
  }

  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static sanitizeString(str, maxLength = 255) {
    if (!str || typeof str !== "string") return "";
    let sanitized = str.trim().replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength).trim() + "...";
    }
    return sanitized;
  }

  static sanitizeJobData(jobData) {
    return {
      title: this.sanitizeString(jobData.title) || "N/A",
      institution: this.sanitizeString(jobData.institution) || "N/A",
      url: jobData.url,
      location: this.sanitizeString(jobData.location) || "N/A",
      start_date: this.sanitizeString(jobData.start_date) || "N/A",
      vacancies: this.sanitizeString(jobData.vacancies) || "N/A",
      description: this.sanitizeString(jobData.description, 1000) || "N/A",
      emails: (jobData.emails || []).filter(this.isValidEmail),
      phones: jobData.phones || [],
    };
  }

  static validateJobData(jobData) {
    const errors = [];
    if (!jobData.title || jobData.title.trim().length === 0) errors.push("Title is required");
    if (!jobData.institution || jobData.institution.trim().length === 0) errors.push("Institution is required");
    if (!jobData.url || !this.isValidUrl(jobData.url)) errors.push("Valid URL is required");
    return { isValid: errors.length === 0, errors };
  }
}

export class RetryHelper {
  static async withRetry(fn, maxRetries = 3, initialDelayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) throw error;

        let delay = initialDelayMs * Math.pow(2, attempt - 1);
        if (error && typeof error.message === 'string') {
          // Pattern 1: JSON field retryDelay:"58s"
          const m1 = error.message.match(/"retryDelay":"(\d+)s"/);
          // Pattern 2: Human hint: Please retry in 58.2s
          const m2 = error.message.match(/Please retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
          const d1 = m1 && m1[1] ? parseInt(m1[1], 10) * 1000 : 0;
          const d2 = m2 && m2[1] ? Math.ceil(parseFloat(m2[1]) * 1000) : 0;
          const suggested = Math.max(d1, d2);
          if (suggested > 0) {
            delay = suggested + Math.floor(Math.random() * 2000); // small jitter
            logger.warn(`API suggested a retry delay. Waiting for ${Math.round(delay / 1000)}s.`);
          }
        }
        
        logger.warn(`Attempt ${attempt} failed, retrying in ${Math.round(delay/1000)}s.`);
        await this.sleep(delay);
      }
    }
    throw lastError;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class TextProcessor {
  static cleanHTML(html) {
    if (!html) return "";
    
    // Remove script and style tags completely
    let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, " ");
    
    // Remove JavaScript-like patterns
    cleaned = cleaned.replace(/\b(?:function|var|let|const|if|else|for|while|return)\b.*?[{};]/g, '');
    cleaned = cleaned.replace(/window\.[^;]+;/g, '');
    cleaned = cleaned.replace(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[^;]+;/g, '');
    
    // Clean up whitespace and special characters
    cleaned = cleaned.replace(/\s+/g, " ");
    cleaned = cleaned.replace(/[^\w\s.,!?;:()\-äöüßÄÖÜ@]/g, ' ');
    
    return cleaned.trim();
  }
  
  static truncateText(text, len) {
    if (!text) return "";
    
    // Clean the text first
    const cleaned = this.cleanHTML(text);
    
    // If still too long, truncate
    if (cleaned.length > len) {
      return cleaned.substring(0, len) + "...";
    }
    
    return cleaned;
  }
  
  static extractEmails(text) {
    // Multiple email regex patterns to catch different formats
    const emailRegexes = [
      // Standard email format
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      // Email with spaces (sometimes formatted in HTML)
      /[a-zA-Z0-9._%+-]+\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,}/g,
      // Email in contact context
      /(?:E-?Mail|Email|Kontakt):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
    ];
    
    const emails = new Set();
    
    emailRegexes.forEach(regex => {
      const matches = text.match(regex) || [];
      matches.forEach(match => {
        // Clean up the match (remove spaces and "Email:" prefixes)
        const cleaned = match.replace(/^.*?:?\s*/, '').replace(/\s+/g, '').toLowerCase();
        if (cleaned.includes('@') && cleaned.includes('.')) {
          emails.add(cleaned);
        }
      });
    });
    
    // Convert Set back to Array and filter
    const emailArray = Array.from(emails).filter(email => {
      // Must have valid TLD and not be too long
      return email.length <= 100 && 
             email.length >= 5 &&
             !email.includes('example.com') && 
             !email.includes('test.com') &&
             /\.[a-zA-Z]{2,}$/.test(email) &&
             // Must contain valid characters only
             /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
    });
    
    return emailArray.slice(0, 5); // Limit to max 5 emails
  }
  static extractPhoneNumbers(text) {
    // More precise German phone number regex patterns
    const phoneRegexes = [
      // German landline: +49 (0)30 12345678, 030 12345678, 030-12345678
      /(?:\+49\s?\(0\)|\+49\s?0?|0)(?:30|40|89|711|69|221|211|231|201)\s?[-\/]?\s?\d{6,8}/g,
      // German mobile: +49 (0)15x, +49 (0)16x, +49 (0)17x
      /(?:\+49\s?\(0\)|\+49\s?0?|0)(?:15\d|16\d|17\d)\s?[-\/]?\s?\d{7,8}/g,
      // General German format: +49 xxx xxxxxxx
      /\+49\s?\d{2,4}\s?\d{6,9}/g,
      // Simple format: 0xxx xxxxxxx or 0xxx-xxxxxxx
      /0\d{2,4}[-\s]?\d{6,9}/g
    ];
    
    const phones = [];
    phoneRegexes.forEach(regex => {
      const matches = text.match(regex) || [];
      phones.push(...matches);
    });
    
    // Filter and validate phone numbers
    const validPhones = [...new Set(phones)]
      .filter(phone => {
        // Remove obvious non-phone numbers
        const cleanPhone = phone.replace(/\D/g, '');
        // Must be between 6 and 15 digits (reasonable phone number length)
        return cleanPhone.length >= 6 && cleanPhone.length <= 15;
      })
      .filter(phone => {
        // Exclude numbers that are clearly not phones (like years, IDs, etc.)
        const cleanPhone = phone.replace(/\D/g, '');
        return !/^(19|20)\d{2}$|^[0-9]{13,}$/.test(cleanPhone);
      })
      .slice(0, 5); // Limit to max 5 phone numbers
    
    return validPhones;
  }
}

export class ErrorHandler {
  static handleScrapingError(error, url) {
    logger.error(`Scraping error for ${url}: ${error.message}`);
  }
  static handleDatabaseError(error, op) {
    logger.error(`Database error during ${op}: ${error.message}`);
  }
}

// FIX: Added the missing SimpleProgressTracker class
export class SimpleProgressTracker {
  constructor(total, title = 'Processing') {
    this.total = total;
    this.title = title;
    this.current = 0;
    this.barLength = 30;
    logger.info(`${this.title} starting with ${this.total} items.`);
  }

  increment() {
    this.current++;
    const percentage = Math.round((this.current / this.total) * 100);
    const filledLength = Math.round(this.barLength * (this.current / this.total));
    const bar = '█'.repeat(filledLength) + '-'.repeat(this.barLength - filledLength);
    
    // Writes progress to the same line in the console
    process.stdout.write(`\r${this.title}: [${bar}] ${percentage}% (${this.current}/${this.total})`);
  }

  complete() {
    // Writes a new line after the progress bar is finished
    process.stdout.write('\n');
    logger.success(`${this.title} completed successfully.`);
  }
}