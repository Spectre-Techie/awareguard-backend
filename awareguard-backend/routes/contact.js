// awareguard-backend/routes/contact.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import { sendContactNotification } from '../utils/emailService.js';

const router = express.Router();

// Rate limiting - prevent spam (5 submissions per hour per IP)
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: {
        error: 'Too many contact submissions from this IP. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Contact Schema (simple model for storing inquiries)
import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    company: {
        type: String,
        trim: true,
        default: ''
    },
    inquiryType: {
        type: String,
        enum: ['enterprise', 'general', 'support'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'resolved'],
        default: 'new'
    },
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true
});

const Contact = mongoose.model('Contact', contactSchema);

/**
 * POST /api/contact
 * Submit contact form
 */
router.post('/', contactLimiter, async (req, res) => {
    try {
        const { name, email, company, inquiryType, message } = req.body;

        // Validation
        if (!name || !email || !inquiryType || !message) {
            return res.status(400).json({
                error: 'Please provide all required fields (name, email, inquiry type, message)'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Please provide a valid email address'
            });
        }

        // Save to database
        const contactSubmission = new Contact({
            name,
            email,
            company: company || '',
            inquiryType,
            message,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        await contactSubmission.save();

        // Send email notification to admin
        try {
            await sendContactNotification({
                name,
                email,
                company,
                inquiryType,
                message,
                submittedAt: new Date().toLocaleString()
            });
        } catch (emailError) {
            console.error('❌ Failed to send email notification:', emailError);
            // Don't fail the request if email fails
        }

        // Return success
        res.status(200).json({
            success: true,
            message: 'Thank you for contacting us! Redirecting to WhatsApp...'
        });

    } catch (error) {
        console.error('❌ Contact form error:', error);
        res.status(500).json({
            error: 'Failed to submit contact form. Please try again.'
        });
    }
});

/**
 * GET /api/contact (Admin only - optional)
 * Get all contact submissions
 */
router.get('/', async (req, res) => {
    try {
        const contacts = await Contact.find()
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({
            success: true,
            count: contacts.length,
            contacts
        });
    } catch (error) {
        console.error('❌ Error fetching contacts:', error);
        res.status(500).json({
            error: 'Failed to fetch contacts'
        });
    }
});

export default router;
