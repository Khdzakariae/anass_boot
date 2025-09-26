import express from 'express';
import multer from 'multer';
// import authenticate from '../middleware/auth.js';


import { 
    addAusbildung, 
    getAussbildung, 
    scrapeAusbildung, 
    // generateLetters, 
    sendCampaignEmails,
    sendEmail, 
    getStats, 
    createCampaign,
    getCampaigns,
    updateCampaignStatus,
    getDocuments,
    deleteAusbildung 

} from '../services/aussbildung.js';

const router = express.Router();
// const upload = multer({ dest: 'cv_uploads/' });

// routes/ausbildung.js
// router.get('/:userId', getAussbildung); // User-specific ausbildungen
router.get('/', getAussbildung); // All ausbildungen (admin view)
router.post('/', addAusbildung);
router.post('/scrape', scrapeAusbildung); // Include userId in body
// router.post('/send-email', sendEmail);
router.get('/stats/:userId', getStats);
router.delete('/ausbildung/:id', deleteAusbildung); // Include userId in body
router.get("/stats", getStats);
router.post('/campaigns', createCampaign);
router.get('/campaigns', getCampaigns);
router.patch('/campaigns/:campaignId/status', updateCampaignStatus);
router.get('/documents', getDocuments);
router.post('/send-email-campaign', sendCampaignEmails);
router.post('/campaigns/:campaignId/send', sendCampaignEmails);


export default router;
