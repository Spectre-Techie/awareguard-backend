// awareguard-backend/routes/admin.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { Story } from '../models/Story.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Admin-only middleware — checks against ADMIN_EMAIL env var
const adminOnly = (req, res, next) => {
    if (req.user.email !== process.env.ADMIN_EMAIL) {
        logger.warn('Unauthorized admin access attempt', { userId: req.user._id, email: req.user.email });
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Apply auth + admin check to all routes
router.use(authMiddleware, adminOnly);

// ===== DASHBOARD STATS =====

/**
 * GET /api/admin/dashboard
 * Get comprehensive dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
    try {
        const now = new Date();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Parallel queries for performance
        const [
            totalUsers,
            newUsersLast30Days,
            premiumUsers,
            totalReports,
            pendingReports,
            totalStories,
            totalRevenue,
            recentPayments
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: last30Days } }),
            User.countDocuments({ isPremium: true }),
            Report.countDocuments(),
            Report.countDocuments({ status: 'pending' }),
            Story.countDocuments(),
            PaymentTransaction.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            PaymentTransaction.find({ status: 'success' })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('userId', 'name email')
        ]);

        // User growth (last 7 days)
        const userGrowth = await User.aggregate([
            { $match: { createdAt: { $gte: last7Days } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            overview: {
                totalUsers,
                newUsersLast30Days,
                premiumUsers,
                freeUsers: totalUsers - premiumUsers,
                premiumPercentage: totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 100) : 0,
                totalReports,
                pendingReports,
                totalStories,
                totalRevenue: totalRevenue[0]?.total || 0
            },
            userGrowth,
            recentPayments: recentPayments.map(p => ({
                id: p._id,
                reference: p.reference,
                amount: p.amount,
                plan: p.plan,
                user: p.userId ? { name: p.userId.name, email: p.userId.email } : null,
                date: p.createdAt
            }))
        });
    } catch (err) {
        logger.error('Dashboard stats error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// ===== USER MANAGEMENT =====

/**
 * GET /api/admin/users
 * Get all users with filtering and pagination
 */
router.get('/users', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            search = '',
            role = '',
            isPremium = ''
        } = req.query;

        const query = {};

        // Search filter
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Role filter
        if (role) query.role = role;

        // Premium filter
        if (isPremium !== '') query.isPremium = isPremium === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-passwordHash -refreshTokens')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        res.json({
            users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        logger.error('Fetch users error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * GET /api/admin/users/:id
 * Get detailed user information
 */
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-passwordHash -refreshTokens')
            .lean();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's payment history
        const payments = await PaymentTransaction.find({ userId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ user, payments });
    } catch (err) {
        logger.error('Fetch user details error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

/**
 * PATCH /api/admin/users/:id
 * Update user details (role, premium status, etc.)
 */
router.patch('/users/:id', async (req, res) => {
    try {
        const { isPremium, subscriptionPlan, subscriptionExpiresAt } = req.body;

        const updates = {};
        if (isPremium !== undefined) updates.isPremium = isPremium;
        if (subscriptionPlan !== undefined) updates.subscriptionPlan = subscriptionPlan;
        if (subscriptionExpiresAt !== undefined) updates.subscriptionExpiresAt = subscriptionExpiresAt;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, select: '-passwordHash -refreshTokens' }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info('User updated by admin', {
            userId: req.params.id,
            updates,
            adminId: req.user._id
        });

        res.json({ success: true, user });
    } catch (err) {
        logger.error('Update user error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user (soft delete by setting role to 'deleted')
 */
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.warn('User deleted by admin', {
            userId: req.params.id,
            email: user.email,
            adminId: req.user._id
        });

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        logger.error('Delete user error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ===== REPORT MANAGEMENT =====

/**
 * GET /api/admin/reports
 * Get all reports with filtering
 */
router.get('/reports', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status = ''
        } = req.query;

        const query = {};
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [reports, total] = await Promise.all([
            Report.find(query)
                .populate('reviewedBy', 'name email')
                .populate('publishedStoryId', 'title')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Report.countDocuments(query)
        ]);

        res.json({
            reports,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        logger.error('Fetch reports error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

/**
 * POST /api/admin/reports/:id/approve
 * Approve report and publish as story
 */
router.post('/reports/:id/approve', async (req, res) => {
    try {
        const { title, category } = req.body;

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (report.status !== 'pending') {
            return res.status(400).json({ error: 'Report already processed' });
        }

        // Create story from report
        const story = await Story.create({
            name: report.name,
            title: title || `Scam Report: ${report.details.substring(0, 50)}...`,
            category: category || 'Scam Report',
            content: report.details,
            isApproved: true
        });

        // Update report
        report.status = 'approved';
        report.reviewedBy = req.user._id;
        report.reviewedAt = new Date();
        report.publishedStoryId = story._id;
        await report.save();

        logger.info('Report approved and published', {
            reportId: report._id,
            storyId: story._id,
            adminId: req.user._id
        });

        res.json({
            success: true,
            message: 'Report approved and published to community stories',
            story
        });
    } catch (err) {
        logger.error('Approve report error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to approve report' });
    }
});

/**
 * POST /api/admin/reports/:id/reject
 * Reject a report
 */
router.post('/reports/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (report.status !== 'pending') {
            return res.status(400).json({ error: 'Report already processed' });
        }

        report.status = 'rejected';
        report.reviewedBy = req.user._id;
        report.reviewedAt = new Date();
        report.rejectionReason = reason || 'Does not meet community guidelines';
        await report.save();

        logger.info('Report rejected', { reportId: report._id, adminId: req.user._id });

        res.json({ success: true, message: 'Report rejected' });
    } catch (err) {
        logger.error('Reject report error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to reject report' });
    }
});

// ===== STORY MANAGEMENT =====

/**
 * GET /api/admin/stories
 * Get all stories with filtering
 */
router.get('/stories', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [stories, total] = await Promise.all([
            Story.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Story.countDocuments()
        ]);

        res.json({
            stories,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        logger.error('Fetch stories error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

/**
 * DELETE /api/admin/stories/:id
 * Delete a story
 */
router.delete('/stories/:id', async (req, res) => {
    try {
        const story = await Story.findByIdAndDelete(req.params.id);

        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        logger.warn('Story deleted by admin', {
            storyId: req.params.id,
            title: story.title,
            adminId: req.user._id
        });

        res.json({ success: true, message: 'Story deleted successfully' });
    } catch (err) {
        logger.error('Delete story error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to delete story' });
    }
});

// ===== PAYMENT MANAGEMENT =====

/**
 * GET /api/admin/payments
 * Get all payment transactions
 */
router.get('/payments', async (req, res) => {
    try {
        const { page = 1, limit = 50, status = '' } = req.query;

        const query = {};
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [payments, total] = await Promise.all([
            PaymentTransaction.find(query)
                .populate('userId', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            PaymentTransaction.countDocuments(query)
        ]);

        res.json({
            payments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        logger.error('Fetch payments error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// ===== SETTINGS =====

/**
 * GET /api/admin/settings
 * Get system settings (placeholder for future expansion)
 */
router.get('/settings', async (req, res) => {
    try {
        // Placeholder - can be expanded to include configurable settings
        res.json({
            system: {
                environment: process.env.NODE_ENV || 'development',
                frontendUrl: process.env.FRONTEND_URL,
                mongoConnected: true
            },
            features: {
                paymentsEnabled: !!process.env.PAYSTACK_SECRET_KEY,
                emailEnabled: !!process.env.RESEND_API_KEY,
                oauthEnabled: !!process.env.GOOGLE_CLIENT_ID
            }
        });
    } catch (err) {
        logger.error('Fetch settings error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

export default router;
