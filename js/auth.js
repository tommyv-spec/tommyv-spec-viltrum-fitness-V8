// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - AUTHENTICATION SYSTEM
// Supabase-based secure authentication with Google Sheets integration
// ═══════════════════════════════════════════════════════════════════════════

// Import configuration from centralized config file
import { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_SCRIPT_URL } from './config.js';
import DataPreloader from './data-preloader.js';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// CORE AUTHENTICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign up a new user
 * @param {string} email - User's email
 * @param {string} password - User's password (min 6 characters)
 * @param {string} fullName - User's full name (for backend/Google Sheets)
 * @param {string} username - User's username (displayed in app)
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function signUp(email, password, fullName, username) {
    try {
        
        // Create user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
            options: {
                emailRedirectTo: undefined, // Skip email confirmation
                data: {
                    full_name: fullName,
                    username: username
                }
            }
        });

        if (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }

        if (data.user) {
            // Store user info in localStorage
            const userEmail = email.trim().toLowerCase();
            localStorage.setItem('loggedUser', userEmail);
            localStorage.setItem('userName', username); // Username for display in app
            localStorage.setItem('userFullName', fullName); // Full name for backend
            
            
            // ✨ AUTOMATICALLY ADD USER TO GOOGLE SHEETS
            try {
                
                // Use GET request with URL parameters to bypass CORS
                const url = new URL(GOOGLE_SCRIPT_URL);
                url.searchParams.append('action', 'addTrialUser');
                url.searchParams.append('email', userEmail);
                url.searchParams.append('name', fullName);
                
                const response = await fetch(url.toString(), {
                    method: 'GET'
                });
                
                const result = await response.json();
                
                if (result.status === 'success' || result.status === 'info') {
                } else {
                    console.warn('⚠️ Google Sheets response:', result.message);
                }
            } catch (sheetError) {
                console.error('❌ Failed to add user to Google Sheets:', sheetError);
                // Note: We don't fail the signup if Sheets update fails
                // User is still created in Supabase
            }
            
            // 🚀 V8: Start comprehensive preloading IMMEDIATELY after signup
            startLoginPreload(userEmail);
            
            return { success: true, user: data.user };
        }

        return { success: false, error: 'Signup failed' };

    } catch (error) {
        console.error('Signup exception:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

/**
 * Sign in an existing user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function signIn(email, password) {
    try {
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
        });

        if (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }

        if (data.user) {
            // Store user info in localStorage
            const userEmail = email.trim().toLowerCase();
            localStorage.setItem('loggedUser', userEmail);
            localStorage.setItem('userName', data.user.user_metadata?.username || 'User'); // Username for display
            localStorage.setItem('userFullName', data.user.user_metadata?.full_name || 'User'); // Full name for backend
            
            // 🚀 V8: Start comprehensive preloading IMMEDIATELY after login
            // This runs in parallel - doesn't block the redirect
            startLoginPreload(userEmail);
            
            return { success: true, user: data.user };
        }

        return { success: false, error: 'Login failed' };

    } catch (error) {
        console.error('Login exception:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

/**
 * V8: Comprehensive preload at login
 * Starts DataPreloader first, then OfflinePreloader with full user data
 */
async function startLoginPreload(email) {
    console.log('🚀 V8: Starting comprehensive login preload...');
    
    try {
        // Step 1: Load user data (plans, workouts, nutrition info)
        const cacheData = await DataPreloader.loadAll(email);
        console.log('✅ DataPreloader complete');
        
        // Step 2: If DataPreloader succeeded, start OfflinePreloader immediately
        if (cacheData && cacheData.isLoaded) {
            const userData = DataPreloader.getUserData();
            
            if (userData) {
                // Build userInfo object for OfflinePreloader
                const userInfo = {
                    email: userData.email || email,
                    plans: userData.plans || [],
                    allPlansData: DataPreloader.getPlans() || {},
                    allWorkoutsData: DataPreloader.getAllMuscleWorkouts() || {},
                    runWorkouts: DataPreloader.getAllRunWorkouts() || {},
                    nutritionPdfUrl: userData.nutritionPdfUrl || null
                };
                
                // Start offline preload (images, audio, nutrition PDF)
                // This continues in background even after page navigation
                if (typeof window.OfflinePreloader !== 'undefined') {
                    console.log('🔄 Starting OfflinePreloader from login...');
                    window.OfflinePreloader.preloadAll(userInfo, {
                        scriptUrl: GOOGLE_SCRIPT_URL
                    }).then(result => {
                        console.log('✅ OfflinePreloader complete:', result);
                    }).catch(err => {
                        console.warn('⚠️ OfflinePreloader error:', err);
                    });
                }
                
                // Also preload food database for nutrition section
                preloadFoodDatabase();
            }
        }
    } catch (e) {
        console.warn('⚠️ Login preload error:', e);
    }
}

/**
 * Preload food-database.json for nutrition section
 */
async function preloadFoodDatabase() {
    try {
        // Check if already cached in sessionStorage
        const cached = sessionStorage.getItem('viltrum_food_database');
        if (cached) {
            console.log('✅ Food database already cached');
            return;
        }
        
        console.log('🥗 Preloading food database...');
        const response = await fetch('./food-database.json');
        if (response.ok) {
            const data = await response.json();
            sessionStorage.setItem('viltrum_food_database', JSON.stringify(data));
            console.log('✅ Food database preloaded');
        }
    } catch (e) {
        // Try alternate path (for pages/ directory)
        try {
            const response = await fetch('../food-database.json');
            if (response.ok) {
                const data = await response.json();
                sessionStorage.setItem('viltrum_food_database', JSON.stringify(data));
                console.log('✅ Food database preloaded (alt path)');
            }
        } catch (e2) {
            console.warn('⚠️ Could not preload food database:', e2);
        }
    }
}

/**
 * Sign out the current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }

        // Clear localStorage
        localStorage.removeItem('loggedUser');
        localStorage.removeItem('userName');
        localStorage.removeItem('userFullName');
        
        // 🚀 V7: Pulisci cache dati
        DataPreloader.clearCache();
        
        return { success: true };

    } catch (error) {
        console.error('Logout exception:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

/**
 * Check if user is authenticated
 * Redirects to index.html if not authenticated
 * @returns {Promise<boolean>} - True if authenticated, false otherwise
 */
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            // Not logged in
            if (window.location.pathname !== '/index.html' && 
                window.location.pathname !== '/' && 
                !window.location.pathname.includes('index.html')) {
                window.location.href = 'index.html';
            }
            return false;
        }

        // Logged in - ensure localStorage is set
        const email = session.user.email.toLowerCase();
        localStorage.setItem('loggedUser', email);
        localStorage.setItem('userName', session.user.user_metadata?.username || 'User');
        localStorage.setItem('userFullName', session.user.user_metadata?.full_name || 'User');
        
        return true;

    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

/**
 * Get current user information
 * @returns {Promise<{email: string, username: string, fullName: string} | null>}
 */
async function getCurrentUser() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return null;

        return {
            email: session.user.email.toLowerCase(),
            username: session.user.user_metadata?.username || 'User',
            fullName: session.user.user_metadata?.full_name || 'User'
        };

    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFRESH SESSION
// ═══════════════════════════════════════════════════════════════════════════

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
    
    if (event === 'SIGNED_IN') {
    } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('loggedUser');
        localStorage.removeItem('userName');
        localStorage.removeItem('userFullName');
    } else if (event === 'TOKEN_REFRESHED') {
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPOSE TO GLOBAL SCOPE (for inline scripts in HTML)
// ═══════════════════════════════════════════════════════════════════════════
window.checkAuth = checkAuth;
window.signUp = signUp;
window.signIn = signIn;
window.signOut = signOut;
window.supabase = supabase;

console.log('Auth.js loaded successfully');