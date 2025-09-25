import { PrismaClient } from '@prisma/client';
import { logger } from './utils.js';
import fs from 'fs';
import path from 'path';

class DatabaseManager {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect() {
    await this.prisma.$connect();
  }

  
  async disconnect() {
    await this.prisma.$disconnect();
  }

  /**
   * Serializes an array into a JSON string for database storage.
   * @param {Array} array - The array to serialize.
   * @returns {string} - The JSON string representation.
   */
  _serializeArray(array) {
    return JSON.stringify(array || []);
  }

  /**
   * Deserializes a JSON string back into an array.
   * @param {string} jsonString - The JSON string from the database.
   * @returns {Array} - The deserialized array.
   */
  _deserializeArray(jsonString) {
    try {
      return JSON.parse(jsonString || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Transforms a database job object for client-side output.
   * @param {object} job - The job object from Prisma.
   * @returns {object|null} - The formatted job object.
   */
  _transformJobForOutput(job) {
    if (!job) return null;
    return {
      id: job.id,
      title: job.title,
      institution: job.institution,
      location: job.location,
      startDate: job.startDate,
      vacancies: job.vacancies,
      description: job.description,
      emails: this._deserializeArray(job.emails),
      phones: this._deserializeArray(job.phones),
      url: job.url,
      motivationLetterPath: job.motivationLetterPath,
      status: job.status,
      userId: job.userId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
  
  /**
   * Transforms client-side job data for database input.
   * @param {object} jobData - The job data from the client.
   * @param {string} userId - The associated user's ID.
   * @returns {object} - The formatted data for Prisma.
   */
  _transformJobForInput(jobData, userId) {
    return {
      title: jobData.title,
      institution: jobData.institution,
      location: jobData.location || 'N/A',
      startDate: jobData.start_date || jobData.startDate || 'N/A',
      vacancies: jobData.vacancies || 'N/A',
      description: jobData.description || 'N/A',
      emails: this._serializeArray(jobData.emails),
      phones: this._serializeArray(jobData.phones),
      url: jobData.url,
      userId,
    };
  }

  /**
   * Saves a document's metadata to the database.
   * @param {string} userId - The ID of the user uploading the document.
   * @param {object|string} fileOrPath - The file object from Multer or a file path string.
   * @param {string} originalName - Original name (for generated files).
   * @returns {Promise<object>} The saved document record from the database.
   */
  async saveDocument(userId, fileOrPath, originalName = null) {
    try {
      let data;
      
      if (typeof fileOrPath === 'string') {
        // Generated letter path
        const stats = fs.statSync(fileOrPath);
        data = {
          userId,
          filename: path.basename(fileOrPath),
          originalName: originalName || path.basename(fileOrPath),
          filePath: fileOrPath,
          mimeType: 'application/pdf',
          fileSize: stats.size,
        };
      } else {
        // Uploaded file (multer)
        data = {
          userId,
          filename: fileOrPath.filename,
          originalName: fileOrPath.originalname,
          filePath: fileOrPath.path,
          mimeType: fileOrPath.mimetype,
          fileSize: fileOrPath.size,
        };
      }

      const document = await this.prisma.document.create({ data });
      logger.success(`Document saved to database: ${document.originalName}`);
      return document;
    } catch (error) {
      logger.error(`Failed to save document to database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieves all documents for a specific user.
   * @param {string} userId - The user ID.
   * @returns {Promise<Array>} Array of user documents.
   */
  async getUserDocuments(userId) {
    try {
      const documents = await this.prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return documents;
    } catch (error) {
      logger.error(`Failed to fetch user documents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletes a document by ID.
   * @param {string} documentId - The document ID.
   * @param {string} userId - The user ID (for security).
   * @returns {Promise<object>} The deleted document.
   */
  async deleteDocument(documentId, userId) {
    try {
      // First check if document exists and belongs to user
      const document = await this.prisma.document.findFirst({
        where: { id: documentId, userId }
      });

      if (!document) {
        throw new Error('Document not found or access denied');
      }

      // Delete file from filesystem
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
      }

      // Delete from database
      const deletedDocument = await this.prisma.document.delete({
        where: { id: documentId }
      });

      logger.success(`Document deleted: ${deletedDocument.originalName}`);
      return deletedDocument;
    } catch (error) {
      logger.error(`Failed to delete document: ${error.message}`);
      throw error;
    }
  }
  
  async createJob(jobData, userId) {
    const data = this._transformJobForInput(jobData, userId);
    const job = await this.prisma.ausbildung.create({ data });
    return this._transformJobForOutput(job);
  }

  async findJobById(id) {
    const job = await this.prisma.ausbildung.findUnique({ where: { id } });
    return this._transformJobForOutput(job);
  }

  async findJobByUrl(url, userId) {
    const job = await this.prisma.ausbildung.findUnique({
      where: { url_userId: { url, userId } },
    });
    return this._transformJobForOutput(job);
  }
  
  async updateJobByUrl(url, userId, jobData) {
    const data = this._transformJobForInput(jobData, userId);
    const job = await this.prisma.ausbildung.update({
      where: { url_userId: { url, userId } },
      data,
    });
    return this._transformJobForOutput(job);
  }

  async updateJobStatus(jobId, newStatus) {
    return await this.prisma.ausbildung.update({
      where: { id: jobId },
      data: { status: newStatus },
    });
  }
  
  async updateMotivationLetterPath(jobId, path) {
    return await this.prisma.ausbildung.update({
      where: { id: jobId },
      data: { motivationLetterPath: path },
    });
  }

  async findAllJobs(userId) {
    const jobs = await this.prisma.ausbildung.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map(j => this._transformJobForOutput(j));
  }

  /**
   * Finds all jobs that have emails but no motivation letter yet.
   * This is used by the letter generator.
   * @returns {Promise<Array<object>>} A list of jobs needing letters.
   */
  async findJobsWithoutMotivationLetter() {
    const jobs = await this.prisma.ausbildung.findMany({
      where: {
        AND: [
          { emails: { not: '[]' } }, 
          { motivationLetterPath: null }
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    // No need to transform output here as it's used internally by the generator
    return jobs;
  }

  async getJobStats(userId) {
    try {
      const totalJobs = await this.prisma.ausbildung.count({ where: { userId } });
      const jobsWithMotivationLetters = await this.prisma.ausbildung.count({
        where: { userId, motivationLetterPath: { not: null } },
      });

      const topInstitutionsData = await this.prisma.ausbildung.groupBy({
        by: ['institution'],
        where: { userId },
        _count: { institution: true },
        orderBy: { _count: { institution: 'desc' } },
        take: 5,
      });

      const topInstitutions = topInstitutionsData.map(item => ({
        name: item.institution,
        count: item._count.institution,
      }));

      return { totalJobs, jobsWithMotivationLetters, topInstitutions };
    } catch (error) {
      logger.error('Error getting job stats:', error);
      throw new Error('Could not retrieve job statistics.');
    }
  }

  async cleanupOldJobs(userId, daysOld) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const result = await this.prisma.ausbildung.deleteMany({
      where: { userId, createdAt: { lt: cutoffDate } },
    });
    return result.count;
  }
}

export default DatabaseManager;