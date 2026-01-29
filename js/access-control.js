// access-control.js - Subscription & Access Management
// Handles trial users, paid users, and expired subscriptions

// ============================================================================
// ACCESS LEVEL CONSTANTS
// ============================================================================
const ACCESS_LEVELS = {
  NO_ACCESS: 'no_access',      // Not in Google Sheets at all
  TRIAL: 'trial',              // In Sheets, but scadenza is recent (within trial period)
  EXPIRED: 'expired',          // In Sheets, but scadenza is past
  ACTIVE: 'active'             // In Sheets, scadenza is in future
};

const TRIAL_DURATION_DAYS = 7; // Free trial period

// ============================================================================
// GET USER ACCESS LEVEL
// ============================================================================
async function getUserAccessLevel() {
  const user = await getCurrentUser();
  
  if (!user) {
    return { 
      level: ACCESS_LEVELS.NO_ACCESS, 
      message: 'Please login to continue' 
    };
  }
  
  const userEmail = user.email.toLowerCase();
  
  // Load workout data from Google Sheets
  if (Object.keys(allUserWorkouts).length === 0) {
    await loadWorkoutData();
  }
  
  const userData = allUserWorkouts[userEmail];
  
  // User not in Google Sheets = No Access
  if (!userData) {
    return {
      level: ACCESS_LEVELS.NO_ACCESS,
      email: userEmail,
      message: 'No subscription found. Start your free trial!',
      trialAvailable: true
    };
  }
  
  // Check expiration date
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day
  
  const expiryDate = userData.scadenza ? new Date(userData.scadenza) : null;
  
  if (!expiryDate) {
    // No expiry date set = assume trial
    return {
      level: ACCESS_LEVELS.TRIAL,
      email: userEmail,
      expiryDate: null,
      workouts: userData.workouts || [],
      message: 'Trial access - Subscribe for unlimited access'
    };
  }
  
  expiryDate.setHours(0, 0, 0, 0);
  
  // Calculate days until expiry
  const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
  
  // Expired subscription
  if (expiryDate < today) {
    return {
      level: ACCESS_LEVELS.EXPIRED,
      email: userEmail,
      expiryDate: expiryDate,
      daysExpired: Math.abs(daysUntilExpiry),
      workouts: userData.workouts || [],
      message: 'Subscription expired. Renew to continue training!'
    };
  }
  
  // Check if still in trial period (within X days of expiry being set)
  const accountCreationEstimate = new Date(expiryDate);
  accountCreationEstimate.setDate(accountCreationEstimate.getDate() - TRIAL_DURATION_DAYS);
  
  if (today <= accountCreationEstimate.getTime() + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)) {
    return {
      level: ACCESS_LEVELS.TRIAL,
      email: userEmail,
      expiryDate: expiryDate,
      daysRemaining: daysUntilExpiry,
      workouts: userData.workouts || [],
      message: `Trial: ${daysUntilExpiry} days remaining`
    };
  }
  
  // Active paid subscription
  return {
    level: ACCESS_LEVELS.ACTIVE,
    email: userEmail,
    expiryDate: expiryDate,
    daysRemaining: daysUntilExpiry,
    workouts: userData.workouts || [],
    message: daysUntilExpiry <= 7 ? `Renews in ${daysUntilExpiry} days` : 'Active subscription'
  };
}

// ============================================================================
// CHECK IF USER CAN ACCESS WORKOUTS
// ============================================================================
async function canAccessWorkouts() {
  const accessInfo = await getUserAccessLevel();
  
  // Only ACTIVE users can access full workouts
  return accessInfo.level === ACCESS_LEVELS.ACTIVE;
}

// ============================================================================
// CHECK IF USER CAN ACCESS WORKOUT PREVIEW
// ============================================================================
async function canAccessWorkoutPreview() {
  const accessInfo = await getUserAccessLevel();
  
  // TRIAL and ACTIVE users can see previews
  return [ACCESS_LEVELS.TRIAL, ACCESS_LEVELS.ACTIVE].includes(accessInfo.level);
}

// ============================================================================
// DISPLAY ACCESS STATUS IN DASHBOARD
// ============================================================================
async function displayAccessStatus() {
  const accessInfo = await getUserAccessLevel();
  const statusContainer = document.getElementById('access-status');
  
  if (!statusContainer) return;
  
  let statusHTML = '';
  
  switch (accessInfo.level) {
    case ACCESS_LEVELS.NO_ACCESS:
      statusHTML = `
        <div class="access-banner trial-banner">
          <h3>🎉 Welcome to Viltrum Fitness!</h3>
          <p>Start your <strong>7-day free trial</strong> to access professional workout programs</p>
          <button onclick="startFreeTrial()" class="cta-button">Start Free Trial</button>
        </div>
      `;
      break;
      
    case ACCESS_LEVELS.TRIAL:
      statusHTML = `
        <div class="access-banner trial-banner">
          <h3>⏰ Free Trial Active</h3>
          <p>${accessInfo.daysRemaining} days remaining</p>
          <p class="small">Upgrade now to continue after trial ends</p>
          <button onclick="showSubscriptionPlans()" class="cta-button">View Plans</button>
        </div>
      `;
      break;
      
    case ACCESS_LEVELS.EXPIRED:
      statusHTML = `
        <div class="access-banner expired-banner">
          <h3>⚠️ Subscription Expired</h3>
          <p>Your access expired ${accessInfo.daysExpired} days ago</p>
          <p class="small">Renew now to continue your fitness journey</p>
          <button onclick="showSubscriptionPlans()" class="cta-button urgent">Renew Now</button>
        </div>
      `;
      break;
      
    case ACCESS_LEVELS.ACTIVE:
      if (accessInfo.daysRemaining <= 7) {
        statusHTML = `
          <div class="access-banner active-banner warning">
            <h3>✅ Active Subscription</h3>
            <p>Renews in ${accessInfo.daysRemaining} days</p>
            <button onclick="showSubscriptionPlans()" class="cta-button secondary">Manage Subscription</button>
          </div>
        `;
      } else {
        statusHTML = `
          <div class="access-banner active-banner">
            <h3>✅ Active Subscription</h3>
            <p>Access until ${accessInfo.expiryDate.toLocaleDateString()}</p>
          </div>
        `;
      }
      break;
  }
  
  statusContainer.innerHTML = statusHTML;
}

// ============================================================================
// DISPLAY WORKOUTS WITH ACCESS CONTROL
// ============================================================================
async function displayUserWorkoutsWithAccess() {
  const accessInfo = await getUserAccessLevel();
  const workoutList = document.getElementById('workout-list');
  
  if (!workoutList) return;
  
  // NO ACCESS - Show trial prompt
  if (accessInfo.level === ACCESS_LEVELS.NO_ACCESS) {
    workoutList.innerHTML = `
      <div class="no-access-message">
        <h2>🏋️ Premium Workout Library</h2>
        <p>Get access to professional training programs designed by expert trainers</p>
        <ul class="feature-list">
          <li>✅ Personalized workout plans</li>
          <li>✅ Exercise videos & instructions</li>
          <li>✅ Progress tracking</li>
          <li>✅ Nutrition guidance</li>
        </ul>
        <button onclick="startFreeTrial()" class="cta-button large">Start 7-Day Free Trial</button>
      </div>
    `;
    return;
  }
  
  // EXPIRED - Show renewal prompt
  if (accessInfo.level === ACCESS_LEVELS.EXPIRED) {
    workoutList.innerHTML = `
      <div class="expired-message">
        <h2>⚠️ Subscription Expired</h2>
        <p>Your workouts are waiting for you! Renew to continue training.</p>
        <div class="workout-preview-locked">
          ${accessInfo.workouts.map(name => `
            <div class="workout-card locked">
              <h3>🔒 ${name}</h3>
              <p>Renew to unlock</p>
            </div>
          `).join('')}
        </div>
        <button onclick="showSubscriptionPlans()" class="cta-button urgent large">Renew Subscription</button>
      </div>
    `;
    return;
  }
  
  // TRIAL - Show preview with upgrade prompt
  if (accessInfo.level === ACCESS_LEVELS.TRIAL) {
    const workoutHTML = accessInfo.workouts.map((workoutName, index) => {
      const workout = allWorkouts[workoutName];
      if (!workout) return '';
      
      // Show first workout fully, rest as preview
      if (index === 0) {
        return `
          <div class="workout-card trial">
            <div class="trial-badge">Trial Access</div>
            <h3>${workoutName}</h3>
            <p class="exercise-count">${workout.exercises.length} exercises</p>
            <button onclick="startWorkout('${workoutName}')" class="start-button">Start Workout</button>
          </div>
        `;
      } else {
        return `
          <div class="workout-card locked">
            <div class="lock-badge">🔒 Premium</div>
            <h3>${workoutName}</h3>
            <p class="exercise-count">${workout.exercises.length} exercises</p>
            <button onclick="showSubscriptionPlans()" class="upgrade-button">Upgrade to Unlock</button>
          </div>
        `;
      }
    }).join('');
    
    workoutList.innerHTML = `
      <div class="trial-workouts">
        <div class="trial-notice">
          <p>🎉 <strong>Trial: ${accessInfo.daysRemaining} days left</strong> - Upgrade to unlock all workouts!</p>
        </div>
        ${workoutHTML}
        <div class="upgrade-prompt">
          <h3>Unlock All Workouts</h3>
          <p>Get unlimited access to all training programs</p>
          <button onclick="showSubscriptionPlans()" class="cta-button">View Plans</button>
        </div>
      </div>
    `;
    return;
  }
  
  // ACTIVE - Show all workouts
  if (accessInfo.level === ACCESS_LEVELS.ACTIVE) {
    const workoutHTML = accessInfo.workouts.map(workoutName => {
      const workout = allWorkouts[workoutName];
      if (!workout) return '';
      
      return `
        <div class="workout-card active">
          <h3>${workoutName}</h3>
          <p class="exercise-count">${workout.exercises.length} exercises</p>
          <button onclick="startWorkout('${workoutName}')" class="start-button">Start Workout</button>
        </div>
      `;
    }).join('');
    
    workoutList.innerHTML = workoutHTML;
  }
}

// ============================================================================
// START FREE TRIAL
// ============================================================================
async function startFreeTrial() {
  const user = await getCurrentUser();
  
  if (!user) {
    alert('Please sign up or login first');
    window.location.href = 'index.html';
    return;
  }
  
  // Show loading
  alert('Starting your free trial...\n\nYour trainer will activate your account within 24 hours.\n\nYou will receive an email confirmation.');
  
  // In a real app, this would:
  // 1. Send request to your backend
  // 2. Add user to Google Sheets with trial expiry
  // 3. Send confirmation email
  
  // For now, tell user to contact you
  const contactAdmin = confirm(
    'To activate your free trial:\n\n' +
    '1. Your account has been created\n' +
    '2. A trainer will assign your trial workouts within 24 hours\n' +
    '3. You will receive an email when activated\n\n' +
    'Click OK to send activation request'
  );
  
  if (contactAdmin) {
    // You could integrate with email service here
    alert('Request sent! Check your email within 24 hours.');
  }
}

// ============================================================================
// SHOW SUBSCRIPTION PLANS
// ============================================================================
function showSubscriptionPlans() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'subscription-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="close-modal" onclick="this.parentElement.parentElement.remove()">×</button>
      <h2>Choose Your Plan</h2>
      
      <div class="pricing-plans">
        <div class="plan-card">
          <h3>Monthly</h3>
          <div class="price">€29<span>/month</span></div>
          <ul class="plan-features">
            <li>✅ All workout programs</li>
            <li>✅ Nutrition guidance</li>
            <li>✅ Progress tracking</li>
            <li>✅ Cancel anytime</li>
          </ul>
          <button onclick="selectPlan('monthly')" class="select-plan-btn">Select Monthly</button>
        </div>
        
        <div class="plan-card featured">
          <div class="popular-badge">Most Popular</div>
          <h3>Quarterly</h3>
          <div class="price">€69<span>/3 months</span></div>
          <div class="savings">Save €18!</div>
          <ul class="plan-features">
            <li>✅ All workout programs</li>
            <li>✅ Nutrition guidance</li>
            <li>✅ Progress tracking</li>
            <li>✅ Priority support</li>
          </ul>
          <button onclick="selectPlan('quarterly')" class="select-plan-btn featured">Select Quarterly</button>
        </div>
        
        <div class="plan-card">
          <h3>Annual</h3>
          <div class="price">€249<span>/year</span></div>
          <div class="savings">Save €99!</div>
          <ul class="plan-features">
            <li>✅ All workout programs</li>
            <li>✅ Nutrition guidance</li>
            <li>✅ Progress tracking</li>
            <li>✅ 1-on-1 coaching session</li>
          </ul>
          <button onclick="selectPlan('annual')" class="select-plan-btn">Select Annual</button>
        </div>
      </div>
      
      <p class="payment-info">💳 Secure payment powered by Stripe</p>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ============================================================================
// SELECT PLAN (Integrate with payment processor)
// ============================================================================
function selectPlan(planType) {
  const user = getCurrentUser();
  
  // In production, integrate with Stripe or PayPal
  alert(`Selected plan: ${planType}\n\nFor payment integration, see: PAYMENT-INTEGRATION-GUIDE.txt`);
  
  // Redirect to payment page (you'll create this)
  // window.location.href = `payment.html?plan=${planType}`;
  
  // Or open Stripe Checkout
  // See PAYMENT-INTEGRATION-GUIDE.txt for full setup
}

// ============================================================================
// PROTECT WORKOUT PAGE
// ============================================================================
async function protectWorkoutPage() {
  const accessInfo = await getUserAccessLevel();
  
  // Only ACTIVE users can start workouts
  if (accessInfo.level !== ACCESS_LEVELS.ACTIVE) {
    alert('Upgrade to access workouts');
    window.location.href = 'dashboard-v7.html';
    return false;
  }
  
  return true;
}

// ============================================================================
// INITIALIZE ON PAGE LOAD
// ============================================================================
if (window.location.pathname.includes('dashboard-v7.html')) {
  window.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    
    if (isAuthenticated) {
      await displayAccessStatus();
      await displayUserWorkoutsWithAccess();
    }
  });
}

if (window.location.pathname.includes('workout.html')) {
  window.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    
    if (isAuthenticated) {
      const canAccess = await protectWorkoutPage();
      if (canAccess) {
        await loadCurrentWorkout();
      }
    }
  });
}
