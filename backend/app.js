import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import PDFParser from "pdf2json";
import fs from "fs";
import multer from "multer";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import authRouter from "./routes/auth.routes.js";
import addAusbildung from "./routes/ausbildung.routes.js";
import settingsRouter from "./routes/settings.routes.js";
import config from "./config.js";
import DatabaseManager from "./db-utils.js";
import { authenticateToken, getUserIdFromToken } from "./middleware/auth.js";


const prisma = new PrismaClient();

import {
  logger,
  FileManager,
  RetryHelper,
  SimpleProgressTracker,
} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();


function createTransporter({ smtpHost, smtpPort, smtpUser, smtpPass }) {
  const port = Number(smtpPort ?? 587);
  return nodemailer.createTransport({
    host: smtpHost || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

const clientOrigins = process.env.CLIENT_ORIGIN || "http://localhost:8080";
const allowedOriginSet = new Set(
  clientOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const serverPort = Number(process.env.PORT || config.app.port || 3000);
allowedOriginSet.add(`http://localhost:${serverPort}`);
allowedOriginSet.add(`http://127.0.0.1:${serverPort}`);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOriginSet.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


 


const runtimeDirectories = [
  config.paths.outputDir,
  config.paths.tempDir,
  config.paths.logsDir,
  config.paths.exportsDir,
  config.paths.cvUploadsDir,
  path.resolve(__dirname, "uploads"),
];

runtimeDirectories.forEach((dir) => {
  FileManager.ensureDirectory(dir);
});

// Configure Multer for in-memory file storage
const storage = multer.memoryStorage(); // Store files in memory instead of disk

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Allow only PDF files for CVs and documents
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'), false);
    }
  }
});

class AdvancedMotivationLetterGenerator {
  constructor({ apiKey, model, dbManager, userId }) {
    if (!apiKey) {
      throw new Error("Missing Gemini API key for this user.");
    }

    this.apiKey = apiKey;
    this.modelName = model || config.apis.geminiModel;
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.modelName });
    this.dbManager = dbManager || new DatabaseManager();
    this.manageConnection = !dbManager;
    this.userId = userId;
  }

  async generateAllMotivationLetters(cvPath) {
    if (!this.userId) {
      throw new Error("Missing user context for letter generation.");
    }

    logger.info("📝 Starting motivation letter generation...");
    let successCount = 0;
    const shouldDisconnect = this.manageConnection;

    try {
      const cvText = await this.extractCVText(cvPath);
      if (shouldDisconnect) {
        await this.dbManager.connect();
      }
      const jobs = await this.dbManager.findJobsWithoutMotivationLetter(this.userId);
      logger.info(`📊 Found ${jobs.length} jobs that need letters.`);
      const progress = new SimpleProgressTracker(jobs.length, "Generating motivation letters");

      for (const job of jobs) {
        try {
          const letterText = await this.generateLetterText(job, cvText);
          
          // Create PDF in memory instead of writing to file
          const pdfBuffer = await this.createPDFBuffer(letterText, job.title, job.institution);
          
          // Store PDF directly in database
          await this.dbManager.updateMotivationLetterData(job.id, pdfBuffer);
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
      if (shouldDisconnect) {
        await this.dbManager.disconnect();
      }
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

  createPDFBuffer(letterText, jobTitle, company) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margins: config.pdf.pageMargins });
      const buffers = [];
      
      // Collect PDF data in memory
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);
      
      // Generate PDF content
      doc.fontSize(14).font("Helvetica-Bold").text(`Bewerbung: ${jobTitle}`, { align: "center" });
      doc.fontSize(12).font("Helvetica").text(`bei ${company}`, { align: "center" }).moveDown(2);
      doc.fontSize(config.pdf.fontSize).font(config.pdf.fontFamily);
      letterText.split("\n").forEach((line) => doc.text(line, { align: "left" }));
      doc.end();
    });
  }
}

app.post("/api/ausbildung/generate-letters", upload.any(), async (req, res) => {
  const userId = getUserIdFromToken(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
  }

  console.log("📝 Generate letters request:", {
    files: req.files?.length || 0,
    body: req.body,
    useExistingCv: req.body.useExistingCv,
    existingCvId: req.body.existingCvId,
  });

  const dbManager = new DatabaseManager();
  let tempFilePath = null;

  try {
    await dbManager.connect();

    const integration = await dbManager.getUserIntegration(userId);
    if (!integration?.geminiApiKey) {
      return res.status(400).json({
        error: "Missing Gemini API key. Please configure it in your settings before generating letters.",
      });
    }

    const existingCVs = await dbManager.prisma.document.findMany({
      where: {
        userId,
        OR: [
          { originalName: { contains: "cv" } },
          { originalName: { contains: "lebenslauf" } },
          { originalName: { contains: "CV" } },
          { originalName: { contains: "Lebenslauf" } },
          { originalName: { endsWith: ".pdf" } },
        ],
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        fileSize: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let cvData = null;
    let cvSource = "uploaded";

    // Check if a new CV is uploaded (files array will contain the cv file)
    const uploadedFile = req.files?.find((file) => file.fieldname === "cv");

    if (uploadedFile?.buffer) {
      await dbManager.saveDocument(userId, uploadedFile);
      cvData = uploadedFile.buffer;
      cvSource = "uploaded";
      console.log("🔍 Using uploaded CV:", uploadedFile.originalname);
    } else if (req.body.useExistingCv && req.body.existingCvId) {
      const existingCV = await dbManager.getDocumentWithData(req.body.existingCvId, userId);

      if (!existingCV) {
        return res.status(404).json({
          error: "Selected CV not found or access denied.",
          existingCVs,
        });
      }

      cvData = existingCV.fileData;
      cvSource = "existing";
      console.log("🔍 Using existing CV:", existingCV.originalName);
    } else {
      return res.status(400).json({
        error: "CV file upload is required or select an existing CV.",
        existingCVs,
      });
    }

    if (cvData) {
      tempFilePath = path.join(os.tmpdir(), `temp_cv_${Date.now()}.pdf`);
      await fs.promises.writeFile(tempFilePath, cvData);
    }

    const generator = new AdvancedMotivationLetterGenerator({
      apiKey: integration.geminiApiKey,
      model: integration.geminiModel,
      dbManager,
      userId,
    });

    const generatedCount = await generator.generateAllMotivationLetters(tempFilePath);

    if (tempFilePath && (await fs.promises.access(tempFilePath).then(() => true).catch(() => false))) {
      await fs.promises.unlink(tempFilePath);
    }

    res.status(200).json({
      message: "Letter generation completed successfully.",
      generatedCount,
      cvSource,
      success: true,
    });
  } catch (error) {
    if (tempFilePath) {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (unlinkError) {
        console.warn("Could not clean up temporary file:", unlinkError.message);
      }
    }

    logger.error("API Letter Generation Error:", { error: error.message, stack: error.stack });
    res.status(500).json({
      error: "Letter generation failed.",
      details: error.message,
      success: false,
    });
  } finally {
    await dbManager.disconnect();
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

    // Handle file upload
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No file was uploaded or file data is missing." });
    }
    
    console.log('🔍 DEBUG - File info:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      bufferLength: file.buffer.length
    });
    
    // 4. File validation is now handled by multer filter
    
    // 5. Save to database with binary data
    console.log('🔍 DEBUG - About to save document with userId:', userId);
    const savedDoc = await dbManager.saveDocument(String(userId), file);

    res.status(200).json({
      success: true,
      message: "Document uploaded and saved successfully.",
      document: {
        id: savedDoc.id,
        filename: savedDoc.filename,
        originalName: savedDoc.originalName,
        mimeType: savedDoc.mimeType,
        fileSize: savedDoc.fileSize,
        createdAt: savedDoc.createdAt
      },
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

// Download file from database
app.get("/api/ausbildung/documents/:documentId/download", async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
    }
    
    const { documentId } = req.params;
    
    // Get document with file data
    const document = await dbManager.getDocumentWithData(documentId, userId);
    
    if (!document) {
      return res.status(404).json({ error: "Document not found or access denied." });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
    res.setHeader('Content-Length', document.fileSize);
    
    // Send the file data
    res.send(document.fileData);
    
  } catch (error) {
    logger.error("File download error:", { error: error.message, stack: error.stack });
    res.status(500).json({ 
      error: "Failed to download document.", 
      details: error.message 
    });
  } finally {
    await dbManager.disconnect();
  }
});

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

// Download motivation letter for a specific job
app.get("/api/ausbildung/jobs/:jobId/motivation-letter", async (req, res) => {
  const dbManager = new DatabaseManager();
  
  try {
    await dbManager.connect();
    
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
    }
    
    const { jobId } = req.params;
    
    // Get job with motivation letter
    const job = await dbManager.prisma.ausbildung.findFirst({
      where: { 
        id: jobId,
        userId: userId
      },
      select: {
        id: true,
        title: true,
        institution: true,
        motivationLetter: true
      }
    });
    
    if (!job || !job.motivationLetter) {
      return res.status(404).json({ error: "Motivation letter not found for this job." });
    }
    
    const filename = `Bewerbung_${job.institution.replace(/[^a-zA-Z0-9]/g, '_')}_${job.id}.pdf`;
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', job.motivationLetter.length);
    
    // Send the PDF data
    res.send(job.motivationLetter);
    
  } catch (error) {
    logger.error("Motivation letter download error:", { error: error.message, stack: error.stack });
    res.status(500).json({ 
      error: "Failed to download motivation letter.", 
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
  console.log("🔍 DEBUG - Request body:", req.body);

  const userId = getUserIdFromToken(req);
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID not found in token." });
  }

  // Get selected emails and files from request body
  const { selectedEmails = [], selectedFiles = [], jobIds = [] } = req.body;
  console.log("🔍 Selected emails:", selectedEmails);
  console.log("🔍 Selected files:", selectedFiles);
  console.log("🔍 Job IDs:", jobIds);

  const dbManager = new DatabaseManager();
  let integration;
  let transporter;

  try {
    await dbManager.connect();
    integration = await dbManager.getUserIntegration(userId);
  } finally {
    await dbManager.disconnect();
  }

  if (!integration?.smtpUser || !integration?.smtpPass) {
    return res.status(400).json({
      error: "SMTP credentials are missing. Please configure them in your settings before sending emails.",
    });
  }

  try {
    transporter = createTransporter({
      smtpHost: integration.smtpHost,
      smtpPort: integration.smtpPort,
      smtpUser: integration.smtpUser,
      smtpPass: integration.smtpPass,
    });

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
          where: {
            ...(jobIds.length > 0 ? { id: { in: jobIds } } : {}),
            motivationLetter: { not: null },
            status: { not: "Done" }
          }
        }, 
        documents: true 
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

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

    // Filter documents by selectedFiles if provided and convert to attachments
    const additionalAttachments = user.documents
      .filter((doc) => {
        if (selectedFiles.length > 0) {
          return selectedFiles.includes(doc.id);
        }
        return true;
      })
      .map((doc) => ({ 
        filename: doc.originalName, 
        content: doc.fileData,
        contentType: doc.mimeType
      }));

    console.log("🔍 Filtered attachments:", additionalAttachments.map(a => a.filename));

    for (const job of user.ausbildungen) {
      try {
        if (!job.motivationLetter || job.motivationLetter.length === 0) {
          results.errors.push({ jobId: job.id, error: "Motivation letter not found." });
          continue;
        }

        if (!job.emails || job.emails.trim() === "") {
          results.errors.push({ jobId: job.id, error: "No recipient email." });
          continue;
        }

        // Use selectedEmails if provided, otherwise use all job emails
        let recipientEmails;
        if (selectedEmails.length > 0) {
          recipientEmails = selectedEmails;
        } else {
          recipientEmails = job.emails.split(",").map((e) => e.trim());
        }

        console.log("🔍 Sending to emails:", recipientEmails);

        // Prepare attachments with motivation letter from database
        const attachments = [
          { 
            filename: `Bewerbung_${user.firstName}_${job.institution.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
            content: job.motivationLetter,
            contentType: 'application/pdf'
          },
          ...additionalAttachments,
        ];

        let jobEmailsSent = 0;
        for (const to of recipientEmails) {
          try {
            const greeting = job.institution
              ? `Sehr geehrtes Ausbildungsteam der ${job.institution},`
              : "Sehr geehrte Damen und Herren,";

            const subject = `Bewerbung um einen Ausbildungsplatz als ${job.title} ab ${job.startDate || "N.N."}`;

            const htmlBody = `
              <p>${greeting}</p>
              <p>anbei übersende ich Ihnen meine Bewerbungsunterlagen für die Ausbildung als <strong>${job.title}</strong> ab ${job.startDate || "N.N."}.</p>
              <p>Im Anhang finden Sie meinen Lebenslauf sowie mein Bewerbungsschreiben.</p>
              <p>Ich freue mich auf Ihre Rückmeldung und die Möglichkeit zu einem persönlichen Gespräch.</p>
              <p>Mit freundlichen Grüßen</p>
              <p><strong>${user.firstName} ${user.lastName}</strong><br>
              <i>${user.email}</i></p>
            `;

            const textBody = `${greeting}\n\n` +
              `anbei übersende ich Ihnen meine Bewerbungsunterlagen für die Ausbildung als ${job.title} ab ${job.startDate || "N.N."}.\n\n` +
              `Im Anhang finden Sie meinen Lebenslauf sowie mein Bewerbungsschreiben.\n\n` +
              `Ich freue mich auf Ihre Rückmeldung und die Möglichkeit zu einem persönlichen Gespräch.\n\n` +
              `Mit freundlichen Grüßen\n` +
              `${user.firstName} ${user.lastName}\n${user.email}`;

            const info = await transporter.sendMail({
              from: `"${user.firstName} ${user.lastName}" <${integration.smtpUser}>`,
              to,
              subject,
              text: textBody,
              html: htmlBody,
              attachments,
            });

            results.sentCount++;
            jobEmailsSent++;
            results.messageIds.push({ jobId: job.id, messageId: info.messageId, to });
            console.log(`✅ Email sent to ${to} for job ${job.title}`);
          } catch (err) {
            console.error(`Failed to send email to ${to}:`, err.message);
            results.errors.push({ jobId: job.id, email: to, error: err.message });
          }
        }

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
        motivationLetter: { not: null }, // Must have motivation letter
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
      pendingJobs: allJobs.filter(job => !job.motivationLetter && job.status !== "Done").length,
      readyToSend: allJobs.filter(job => job.motivationLetter && job.status !== "Done").length,
      doneJobs: allJobs.filter(job => job.status === "Done").length,
      jobsWithMotivationLetters: allJobs.filter(job => job.motivationLetter).length,
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
      pendingJobs: allJobs.filter(job => !job.motivationLetter && job.status !== "Done").length,
      readyToSend: allJobs.filter(job => job.motivationLetter && job.status !== "Done").length,
      doneJobs: allJobs.filter(job => job.status === "Done").length,
      jobsWithMotivationLetters: allJobs.filter(job => job.motivationLetter).length,
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
        motivationLetter: { not: null }, // Must have motivation letter
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
app.use("/api/settings", settingsRouter);

const frontendDistPath = path.resolve(__dirname, "public");

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (
      req.method !== "GET" ||
      req.path.startsWith("/api") ||
      path.extname(req.path)
    ) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || config.app.port || 3000);
const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${displayHost}:${PORT}`);
});