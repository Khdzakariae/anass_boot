import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// ESM-safe replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

export default {
  // Database Configuration
  database: {
    databaseUrl: process.env.DATABASE_URL || "file:./dev.db",
  },

  // API Configuration
  apis: {
    geminiApiKey: process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE",
    geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  },

  // Scraping Configuration
  scraping: {
    baseUrl: "https://www.ausbildung.de/suche/",
    delayBetweenRequests: 500,
    delayBetweenPages: 1000,
    requestTimeout: 15000,
    maxRetries: 3,
    puppeteerOptions: {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  },
  paths: {
    outputDir: path.join(__dirname, 'bewerbungsschreiben'),
    tempDir: path.join(__dirname, 'temp'),
    logsDir: path.join(__dirname, 'logs'),
    exportsDir: path.join(__dirname, 'exports'),
    cvUploadsDir: path.join(__dirname, 'cv_uploads') // Directory for uploaded CVs

  },
  

  // PDF Generation Configuration
  pdf: {
    fontSize: 11,
    fontFamily: 'Helvetica',
    pageMargins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50
    }
  },

  // Letter Generation Configuration
  letterGeneration: {
    delayBetweenGenerations: 20000, // milliseconds to avoid API rate limiting
    maxRetries: 3,
    defaultLanguage: 'de',
    letterStructure: {
      minWords: 300,
      maxWords: 450,
      includeHeader: true,
      includeFooter: true
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFileLogging: true,
    enableConsoleLogging: true,
    maxLogFiles: 5,
    maxLogSize: '10MB'
  },

  // Email Configuration (for future features)
  email: {
    enabled: false,
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    }
  },

  // Application Settings
  app: {
    name: 'Ausbildung Scraper & Motivation Letter Generator',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000
  }
};