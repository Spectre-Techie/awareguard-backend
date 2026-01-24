// awareguard-backend/config/passport.js
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';

/**
 * Configure Google OAuth Strategy
 */
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${process.env.BACKEND_URL || 'https://awareguard-backend.onrender.com'}/api/auth/google/callback`,
            scope: ['profile', 'email']
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                console.log('📧 Google OAuth profile:', profile.emails[0].value);

                // Extract user info from Google profile
                const email = profile.emails[0].value;
                const name = profile.displayName;
                const googleId = profile.id;

                // Check if user already exists
                let user = await User.findOne({ email });

                if (user) {
                    // User exists - update Google ID if not set
                    if (!user.googleId) {
                        user.googleId = googleId;
                        user.emailVerified = true;
                        await user.save();
                        console.log('✅ Linked Google account to existing user:', email);
                    } else {
                        console.log('✅ User logged in with Google:', email);
                    }
                } else {
                    // Create new user with Google OAuth
                    user = new User({
                        name,
                        email,
                        googleId,
                        emailVerified: true,
                        // No password needed for OAuth users
                    });
                    await user.save();
                    console.log('✅ Created new user via Google OAuth:', email);
                }

                return done(null, user);
            } catch (error) {
                console.error('❌ Google OAuth error:', error);
                return done(error, null);
            }
        }
    )
);

export default passport;
