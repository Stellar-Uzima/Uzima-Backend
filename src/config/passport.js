import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import User from '../models/User.js';
import { oauthConfig } from './oauth.js';

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
if (oauthConfig.google.clientID && oauthConfig.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: oauthConfig.google.clientID,
        clientSecret: oauthConfig.google.clientSecret,
        callbackURL: oauthConfig.google.callbackURL,
        scope: oauthConfig.google.scope,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this Google account
          let user = await User.findByOAuthProvider('google', profile.id);

          if (user) {
            // Update access token if needed
            if (user.oauthAccounts && user.oauthAccounts.google) {
              user.oauthAccounts.google.accessToken = accessToken;
              if (refreshToken) {
                user.oauthAccounts.google.refreshToken = refreshToken;
              }
              await user.save();
            }
            return done(null, user);
          }

          // Check if user exists with the same email
          if (profile.emails && profile.emails[0]) {
            user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
              // Link Google account to existing user
              await user.linkOAuthAccount('google', {
                id: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                accessToken,
                refreshToken,
              });
              return done(null, user);
            }
          }

          // Create new user
          const newUser = new User({
            username:
              profile.displayName ||
              profile.emails[0]?.value.split('@')[0] ||
              `google_${profile.id}`,
            email: profile.emails[0]?.value || `${profile.id}@google.local`,
            role: 'patient', // Default role
            oauthAccounts: {
              google: {
                id: profile.id,
                email: profile.emails[0]?.value,
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                accessToken,
                refreshToken,
              },
            },
          });

          await newUser.save();
          return done(null, newUser);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

// GitHub OAuth Strategy
if (oauthConfig.github.clientID && oauthConfig.github.clientSecret) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: oauthConfig.github.clientID,
        clientSecret: oauthConfig.github.clientSecret,
        callbackURL: oauthConfig.github.callbackURL,
        scope: oauthConfig.github.scope,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this GitHub account
          let user = await User.findByOAuthProvider('github', profile.id);

          if (user) {
            // Update access token if needed
            if (user.oauthAccounts && user.oauthAccounts.github) {
              user.oauthAccounts.github.accessToken = accessToken;
              if (refreshToken) {
                user.oauthAccounts.github.refreshToken = refreshToken;
              }
              await user.save();
            }
            return done(null, user);
          }

          // Get primary email from GitHub
          const primaryEmail = profile.emails?.find(email => email.primary) || profile.emails?.[0];

          // Check if user exists with the same email
          if (primaryEmail) {
            user = await User.findOne({ email: primaryEmail.value });

            if (user) {
              // Link GitHub account to existing user
              await user.linkOAuthAccount('github', {
                id: profile.id,
                username: profile.username,
                email: primaryEmail.value,
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                accessToken,
                refreshToken,
              });
              return done(null, user);
            }
          }

          // Create new user
          const newUser = new User({
            username: profile.username || profile.displayName || `github_${profile.id}`,
            email: primaryEmail?.value || `${profile.id}@github.local`,
            role: 'patient', // Default role
            oauthAccounts: {
              github: {
                id: profile.id,
                username: profile.username,
                email: primaryEmail?.value,
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                accessToken,
                refreshToken,
              },
            },
          });

          await newUser.save();
          return done(null, newUser);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

// Microsoft OAuth Strategy
if (oauthConfig.microsoft.clientID && oauthConfig.microsoft.clientSecret) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: oauthConfig.microsoft.clientID,
        clientSecret: oauthConfig.microsoft.clientSecret,
        callbackURL: oauthConfig.microsoft.callbackURL,
        scope: oauthConfig.microsoft.scope,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this Microsoft account
          let user = await User.findByOAuthProvider('microsoft', profile.id);

          if (user) {
            // Update access token if needed
            if (user.oauthAccounts && user.oauthAccounts.microsoft) {
              user.oauthAccounts.microsoft.accessToken = accessToken;
              if (refreshToken) {
                user.oauthAccounts.microsoft.refreshToken = refreshToken;
              }
              await user.save();
            }
            return done(null, user);
          }

          // Check if user exists with the same email
          if (profile.emails && profile.emails[0]) {
            user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
              // Link Microsoft account to existing user
              await user.linkOAuthAccount('microsoft', {
                id: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                accessToken,
                refreshToken,
              });
              return done(null, user);
            }
          }

          // Create new user
          const newUser = new User({
            username:
              profile.displayName ||
              profile.emails[0]?.value.split('@')[0] ||
              `microsoft_${profile.id}`,
            email: profile.emails[0]?.value || `${profile.id}@microsoft.local`,
            role: 'patient', // Default role
            oauthAccounts: {
              microsoft: {
                id: profile.id,
                email: profile.emails[0]?.value,
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                accessToken,
                refreshToken,
              },
            },
          });

          await newUser.save();
          return done(null, newUser);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

export default passport;
