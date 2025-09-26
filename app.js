import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import PDFParser from "pdf2json";
import fs from "fs";
import multer from "multer";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import authRouter from "./routes/auth.routes.js";
import addAusbildung from "./routes/ausbildung.routes.js";
import config from "./config.js";
import DatabaseManager from "./db-utils.js";


const prisma = new PrismaClient();

import {
  logger,
  FileManager,
  RetryHelper,
  SimpleProgressTracker,
} from "./utils.js";

const app = express();


const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT == 465, // true for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, 
  },
});

app.use(
  cors({
    origin: "http://localhost:8080", // Or your frontend's actual origin
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


import jwt from 'jsonwebtoken';

export function getUserIdFromToken(req) {
  console.log('🔍 DEBUG - Headers:', req.headers);
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

export function authenticateToken(req, res, next) {
  const userId = getUserIdFromToken(req);
  
  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized: Invalid or missing token' 
    });
  }
  
  req.userId = userId;
  next();
}

FileManager.ensureDirectory(config.paths.cvUploadsDir);
FileManager.ensureDirectory("uploads/");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "cv") {
      cb(null, config.paths.cvUploadsDir); // CV upload directory
    } else {
      cb(null, "uploads/"); // General documents directory
    }
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname) || '.pdf'; // fallback to .pdf
    const safeName = FileManager.cleanFilename(path.basename(file.originalname, extension));
    cb(null, `${Date.now()}-${safeName}${extension}`);

  },
});

const upload = multer({ storage });

class AdvancedMotivationLetterGenerator {
  constructor() {
    this.apiKey = config.apis.geminiApiKey;
    if (!this.apiKey || this.apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      throw new Error("Missing Gemini API key.");
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.apis.geminiModel });
    this.dbManager = new DatabaseManager();
  }

  async generateAllMotivationLetters(cvPath) {
    logger.info("📝 Starting motivation letter generation...");
    let successCount = 0;
    try {
      await FileManager.ensureDirectory(config.paths.outputDir);
      const cvText = await this.extractCVText(cvPath);
      await this.dbManager.connect();
      const jobs = await this.dbManager.findJobsWithoutMotivationLetter();
      logger.info(`📊 Found ${jobs.length} jobs that need letters.`);
      const progress = new SimpleProgressTracker(jobs.length, "Generating motivation letters");

      for (const job of jobs) {
        try {
          const letterText = await this.generateLetterText(job, cvText);
          const filename = `Bewerbung_${FileManager.cleanFilename(job.institution)}_${job.id}.pdf`;
          const filepath = path.join(config.paths.outputDir, filename);
          await this.createPDF(letterText, filepath, job.title, job.institution);
          await this.dbManager.updateMotivationLetterPath(job.id, filepath);
          await this.dbManager.updateJobStatus(job.id, "Ready to Send");
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
      logger.error("Critical error during letter generation:", { error: error.message, stack: error.stack });
    } finally {
      await this.dbManager.disconnect();
      logger.info("Letter generation process finished.");
    }
    return successCount;
  }

  async extractCVText(cvPath) {
    try {
      if (!(await FileManager.fileExists(cvPath))) {
        throw new Error(`CV file not found at path: ${cvPath}`);
      }
      const pdfText = await new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(this, 1);
        pdfParser.on("pdfParser_dataError", (errData) => reject(new Error(errData.parserError)));
        pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent().trim()));
        pdfParser.loadPDF(cvPath);
      });
      logger.success(`CV parsed successfully. Character count: ${pdfText.length}`);
      return pdfText;
    } catch (error) {
      logger.error(`Failed during CV extraction: ${error.message}`);
      throw new Error(`Failed to read or parse the PDF file. Details: ${error.message}`);
    }
  }

  async generateLetterText(jobInfo, cvText) {
    return await RetryHelper.withRetry(async () => {
      const { title, institution, description, location, startDate } = jobInfo;
      const context = `Ausbildungsposition: ${title}\nStandort: ${location}\nAusbildungsbeginn: ${startDate || "N.N."}`;
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

  createPDF(letterText, filename, jobTitle, company) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margins: config.pdf.pageMargins });
      const stream = fs.createWriteStream(filename);
      doc.pipe(stream);
      doc.fontSize(14).font("Helvetica-Bold").text(`Bewerbung: ${jobTitle}`, { align: "center" });
      doc.fontSize(12).font("Helvetica").text(`bei ${company}`, { align: "center" }).moveDown(2);
      doc.fontSize(config.pdf.fontSize).font(config.pdf.fontFamily);
      letterText.split("\n").forEach((line) => doc.text(line, { align: "left" }));
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
  }
}

app.post("/api/ausbildung/generate-letters", upload.single("cv"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "CV file upload is required." });
  }
  try {
    const generator = new AdvancedMotivationLetterGenerator();
    const generatedCount = await generator.generateAllMotivationLetters(req.file.path);
    res.status(200).json({
      message: "Letter generation completed successfully.",
      generatedCount,
      success: true,
    });
  } catch (error) {
    logger.error("API Letter Generation Error:", { error: error.message, stack: error.stack });
    res.status(500).json({
      error: "Letter generation failed.",
      details: error.message,
      success: false,
    });
  }
});

app.get("/api/ausbildung/documents", async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
    }

    const documents = await dbManager.getUserDocuments(userId);
    
    res.status(200).json(documents);
  } catch (error) {
    logger.error("Failed to fetch documents:", { error: error.message, stack: error.stack });
    res.status(500).json({ 
      error: "Failed to fetch documents.", 
      details: error.message 
    });
  } finally {
    await dbManager.disconnect();
  }
});

app.post("/api/ausbildung/documents/upload", upload.single("file"), async (req, res) => {
    
  // 1. Instantiate the DatabaseManager inside the route handler
  const dbManager = new DatabaseManager(); 
  
  try {
    // 2. Connect to the database
    await dbManager.connect(); 

    // 3. Extract userId with debugging
    const userId = getUserIdFromToken(req);
    console.log('🔍 DEBUG - Raw userId:', userId);
    console.log('🔍 DEBUG - typeof userId:', typeof userId);
    console.log('🔍 DEBUG - userId stringified:', JSON.stringify(userId));
    
    if (!userId || typeof userId !== 'string') {
      console.log('❌ Invalid userId detected:', { userId, type: typeof userId });
      return res.status(401).json({ 
        error: "Unauthorized: Invalid User ID in token.",
        debug: { userId, type: typeof userId }
      });
    }

    // Handle both possible field names ('file' or 'document')
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file was uploaded." });
    }
    
    console.log('🔍 DEBUG - File info:', {
      filename: file.filename,
      originalname: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // 4. Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ 
        error: "Invalid file type. Only PDF, DOC, and DOCX files are allowed." 
      });
    }
    
    // 5. Save to database with explicit string conversion
    console.log('🔍 DEBUG - About to save document with userId:', userId);
    const savedDoc = await dbManager.saveDocument(String(userId), file);

    res.status(200).json({
      success: true,
      message: "Document uploaded and saved successfully.",
      document: savedDoc,
    });

  } catch (err) {
    logger.error("File upload DB save error:", { 
      error: err.message, 
      stack: err.stack,
      userId: getUserIdFromToken(req)
    });
    res.status(500).json({ 
      success: false, 
      error: "Failed to save the document.",
      details: err.message
    });
  } finally {
    // 3. Always ensure the database connection is closed
    await dbManager.disconnect(); 
  }
}
);

app.delete("/api/ausbildung/documents/:documentId", async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
    }

    const { documentId } = req.params;
    if (!documentId) {
      return res.status(400).json({ error: "Document ID is required." });
    }

    const deletedDocument = await dbManager.deleteDocument(documentId, userId);
    
    res.status(200).json({
      success: true,
      message: "Document deleted successfully.",
      document: deletedDocument
    });
    
  } catch (error) {
    logger.error("Document deletion error:", { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete document.",
      details: error.message
    });
  } finally {
    await dbManager.disconnect();
  }
});

app.get("/api/ausbildung/documents/:documentId/download", async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
    }

    const { documentId } = req.params;
    const document = await dbManager.prisma.document.findFirst({
      where: { id: documentId, userId }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found." });
    }

    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({ error: "File not found on server." });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
    res.setHeader('Content-Type', document.mimeType);
    
    const fileStream = fs.createReadStream(document.filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    logger.error("Document download error:", { error: error.message, stack: error.stack });
    res.status(500).json({ 
      error: "Failed to download document.",
      details: error.message
    });
  } finally {
    await dbManager.disconnect();
  }
});
  
app.post("/api/ausbildung/email/send", async (req, res) => {
  console.log("🔍 DEBUG - Incoming request headers:", req.headers);

  const userId = getUserIdFromToken(req);
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
  }

  try {
    await transporter.verify();
  } catch (err) {
    console.error("SMTP connection failed:", err.message);
    return res.status(500).json({
      error: "SMTP connection failed. Check your SMTP credentials and network.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        ausbildungen: {
          // ✅ ONLY GET JOBS WITH MOTIVATION LETTERS THAT AREN'T DONE YET
          where: {
            motivationLetterPath: { not: null }, // Must have motivation letter (ready to send)
            status: { not: "Done" } // Not already sent
          }
        }, 
        documents: true 
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Check if there are any jobs to send
    if (user.ausbildungen.length === 0) {
      return res.status(200).json({
        sentCount: 0,
        errors: [],
        messageIds: [],
        message: "No pending jobs with motivation letters found to send."
      });
    }

    const results = {
      sentCount: 0,
      errors: [],
      messageIds: [],
    };

    const additionalAttachments = user.documents
      .filter((doc) => fs.existsSync(doc.filePath))
      .map((doc) => ({ filename: doc.originalName, path: doc.filePath }));

    for (const job of user.ausbildungen) {
      try {
        if (!job.motivationLetterPath || !fs.existsSync(job.motivationLetterPath)) {
          results.errors.push({ jobId: job.id, error: "Motivation letter not found." });
          continue;
        }

        if (!job.emails || job.emails.trim() === "") {
          results.errors.push({ jobId: job.id, error: "No recipient email." });
          continue;
        }

        const recipientEmails = job.emails.split(",").map((e) => e.trim());

        const attachments = [
          { filename: `Bewerbung_${user.firstName}.pdf`, path: job.motivationLetterPath },
          ...additionalAttachments,
        ];

        let jobEmailsSent = 0;
        for (const to of recipientEmails) {
          try {
            const info = await transporter.sendMail({
              from: `"${user.firstName} ${user.lastName}" <${process.env.SMTP_USER}>`,
              to,
              subject: `Bewerbung: ${job.title} - ${user.firstName}`,
              html: `<p>Sehr geehrte Damen und Herren,</p>
                     <p>anbei übersende ich Ihnen meine Bewerbungsunterlagen für die Ausbildungsstelle als <strong>${job.title}</strong>.</p>
                     <p>Mit freundlichen Grüßen,</p>
                     <p><strong>${user.firstName}</strong><br><i>${user.email}</i></p>`,
              attachments,
            });

            results.sentCount++;
            jobEmailsSent++;
            results.messageIds.push({ jobId: job.id, messageId: info.messageId });
          } catch (err) {
            console.error(`Failed to send email to ${to}:`, err.message);
            results.errors.push({ jobId: job.id, email: to, error: err.message });
          }
        }

        // ✅ UPDATE JOB STATUS TO "DONE" AFTER SUCCESSFUL EMAIL SENDING
        if (jobEmailsSent > 0) {
          await prisma.ausbildung.update({
            where: { id: job.id },
            data: { 
              status: "Done",
              updatedAt: new Date()
            }
          });
          console.log(`✅ Updated job ${job.id} status to "Done"`);
        }

      } catch (err) {
        results.errors.push({ jobId: job.id, error: err.message });
      }
    }

    console.log(`📊 Email sending completed: ${results.sentCount} sent, ${results.errors.length} errors`);
    res.json(results);
  } catch (err) {
    console.error("Email sending error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/ausbildung/ready-to-send", authenticateToken, async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = req.userId;
    
    // ✅ ONLY GET JOBS THAT ARE READY TO SEND (HAVE MOTIVATION LETTERS BUT NOT SENT YET)
    const readyJobs = await dbManager.prisma.ausbildung.findMany({
      where: {
        userId: userId,
        motivationLetterPath: { not: null }, // Must have motivation letter
        status: { not: "Done" } // Not already sent (could be "Pending" or "Ready to Send")
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json(readyJobs);
  } catch (error) {
    logger.error("Failed to fetch ready to send jobs:", { 
      error: error.message, 
      stack: error.stack,
      userId: req.userId 
    });
    res.status(500).json({ 
      error: "Failed to fetch ready to send jobs.", 
      details: error.message 
    });
  } finally {
    await dbManager.disconnect();
  }
});

app.post("/api/ausbildung/email/send", async (req, res) => {
  console.log("🔍 DEBUG - Incoming request headers:", req.headers);

  const userId = getUserIdFromToken(req);
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
  }

  try {
    await transporter.verify();
  } catch (err) {
    console.error("SMTP connection failed:", err.message);
    return res.status(500).json({
      error: "SMTP connection failed. Check your SMTP credentials and network.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        ausbildungen: {
          // ✅ ONLY GET JOBS WITH MOTIVATION LETTERS THAT AREN'T DONE YET
          where: {
            motivationLetterPath: { not: null }, // Must have motivation letter (ready to send)
            status: { not: "Done" } // Not already sent
          }
        }, 
        documents: true 
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Check if there are any jobs to send
    if (user.ausbildungen.length === 0) {
      return res.status(200).json({
        sentCount: 0,
        errors: [],
        messageIds: [],
        message: "No pending jobs with motivation letters found to send."
      });
    }

    const results = {
      sentCount: 0,
      errors: [],
      messageIds: [],
    };

    const additionalAttachments = user.documents
      .filter((doc) => fs.existsSync(doc.filePath))
      .map((doc) => ({ filename: doc.originalName, path: doc.filePath }));

    for (const job of user.ausbildungen) {
      try {
        if (!job.motivationLetterPath || !fs.existsSync(job.motivationLetterPath)) {
          results.errors.push({ jobId: job.id, error: "Motivation letter not found." });
          continue;
        }

        if (!job.emails || job.emails.trim() === "") {
          results.errors.push({ jobId: job.id, error: "No recipient email." });
          continue;
        }

        const recipientEmails = job.emails.split(",").map((e) => e.trim());

        const attachments = [
          { filename: `Bewerbung_${user.firstName}.pdf`, path: job.motivationLetterPath },
          ...additionalAttachments,
        ];

        let jobEmailsSent = 0;
        for (const to of recipientEmails) {
          try {
            const info = await transporter.sendMail({
              from: `"${user.firstName} ${user.lastName}" <${process.env.SMTP_USER}>`,
              to,
              subject: `Bewerbung: ${job.title} - ${user.firstName}`,
              html: `<p>Sehr geehrte Damen und Herren,</p>
                     <p>anbei übersende ich Ihnen meine Bewerbungsunterlagen für die Ausbildungsstelle als <strong>${job.title}</strong>.</p>
                     <p>Mit freundlichen Grüßen,</p>
                     <p><strong>${user.firstName}</strong><br><i>${user.email}</i></p>`,
              attachments,
            });

            results.sentCount++;
            jobEmailsSent++;
            results.messageIds.push({ jobId: job.id, messageId: info.messageId });
          } catch (err) {
            console.error(`Failed to send email to ${to}:`, err.message);
            results.errors.push({ jobId: job.id, email: to, error: err.message });
          }
        }

        // ✅ UPDATE JOB STATUS TO "DONE" AFTER SUCCESSFUL EMAIL SENDING
        if (jobEmailsSent > 0) {
          await prisma.ausbildung.update({
            where: { id: job.id },
            data: { 
              status: "Done",
              updatedAt: new Date()
            }
          });
          console.log(`✅ Updated job ${job.id} status to "Done"`);
        }

      } catch (err) {
        results.errors.push({ jobId: job.id, error: err.message });
      }
    }

    console.log(`📊 Email sending completed: ${results.sentCount} sent, ${results.errors.length} errors`);
    res.json(results);
  } catch (err) {
    console.error("Email sending error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get("/api/ausbildung/stats", authenticateToken, async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = req.userId;
    
    // Get all user jobs
    const allJobs = await dbManager.prisma.ausbildung.findMany({
      where: { userId: userId }
    });
    
    // Calculate stats based on status logic
    const stats = {
      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter(job => !job.motivationLetterPath && job.status !== "Done").length,
      readyToSend: allJobs.filter(job => job.motivationLetterPath && job.status !== "Done").length,
      doneJobs: allJobs.filter(job => job.status === "Done").length,
      jobsWithMotivationLetters: allJobs.filter(job => job.motivationLetterPath).length,
      // Legacy field for compatibility
      applicationsSubmitted: allJobs.filter(job => job.status === "Done").length
    };

    res.status(200).json(stats);
  } catch (error) {
    logger.error("Failed to fetch stats:", { 
      error: error.message, 
      stack: error.stack,
      userId: req.userId 
    });
    res.status(500).json({ 
      error: "Failed to fetch stats.", 
      details: error.message 
    });
  } finally {
    await dbManager.disconnect();
  }
});

app.get("/api/ausbildung/stats", authenticateToken, async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = req.userId;
    
    // Get all user jobs
    const allJobs = await dbManager.prisma.ausbildung.findMany({
      where: { userId: userId }
    });
    
    // Calculate stats based on status logic
    const stats = {
      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter(job => !job.motivationLetterPath && job.status !== "Done").length,
      readyToSend: allJobs.filter(job => job.motivationLetterPath && job.status !== "Done").length,
      doneJobs: allJobs.filter(job => job.status === "Done").length,
      jobsWithMotivationLetters: allJobs.filter(job => job.motivationLetterPath).length,
      // Legacy field for compatibility
      applicationsSubmitted: allJobs.filter(job => job.status === "Done").length
    };

    res.status(200).json(stats);
  } catch (error) {
    logger.error("Failed to fetch stats:", { 
      error: error.message, 
      stack: error.stack,
      userId: req.userId 
    });
    res.status(500).json({ 
      error: "Failed to fetch stats.", 
      details: error.message 
    });
  } finally {
    await dbManager.disconnect();
  }
});

app.get("/api/ausbildung/ready-to-send", authenticateToken, async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = req.userId;
    
    // ✅ ONLY GET JOBS THAT ARE READY TO SEND (HAVE MOTIVATION LETTERS BUT NOT SENT YET)
    const readyJobs = await dbManager.prisma.ausbildung.findMany({
      where: {
        userId: userId,
        motivationLetterPath: { not: null }, // Must have motivation letter
        status: { not: "Done" } // Not already sent (could be "Pending" or "Ready to Send")
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json(readyJobs);
  } catch (error) {
    logger.error("Failed to fetch ready to send jobs:", { 
      error: error.message, 
      stack: error.stack,
      userId: req.userId 
    });
    res.status(500).json({ 
      error: "Failed to fetch ready to send jobs.", 
      details: error.message 
    });
  } finally {
    await dbManager.disconnect();
  }
});

app.use("/api/users", authRouter);

app.use("/api/ausbildung", addAusbildung);
  

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});