import nodemailer from 'nodemailer';
import { logger } from '../utils.js';


const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});



/**
 * Sends an email with attachments.
 * @param {object} mailOptions - Nodemailer mail options object.
 * @returns {Promise<void>}
 */


export const sendEmailWithAttachments = async (mailOptions) => {
  try {
    // Add a default 'from' address
    const optionsWithFrom = {
      from: `"Your Name" <${process.env.SMTP_USER}>`,
      ...mailOptions,
    };
    
    await transporter.sendMail(optionsWithFrom);
    logger.info(`Email sent to ${mailOptions.to}`);

  } catch (error) {
    logger.error(`Nodemailer error sending to ${mailOptions.to}:`, error);
    throw new Error('Failed to send email via Nodemailer.');
  }
};