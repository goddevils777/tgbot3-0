const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

class GoogleAuthManager {
    constructor(userManager) {
        this.userManager = userManager;
        this.setupStrategy();
        this.setupSerialization();
    }

    setupStrategy() {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "/auth/google/callback"
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                // Проверяем существует ли пользователь
                const existingUser = this.userManager.findUserByGoogleId(profile.id);
                
                if (existingUser) {
                    return done(null, existingUser);
                }

                // Создаем нового пользователя
                const newUser = {
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    avatar: profile.photos[0].value,
                    provider: 'google',
                    createdAt: new Date().toISOString()
                };

                const savedUser = this.userManager.createGoogleUser(newUser);
                return done(null, savedUser);
            } catch (error) {
                return done(error, null);
            }
        }));
    }

    setupSerialization() {
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser((id, done) => {
            const user = this.userManager.getUserById(id);
            done(null, user);
        });
    }

    // Middleware для проверки авторизации
    requireAuth(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        res.redirect('/login.html');
    }

    // Получение данных пользователя
    getCurrentUser(req) {
        return req.user || null;
    }
}

module.exports = GoogleAuthManager;