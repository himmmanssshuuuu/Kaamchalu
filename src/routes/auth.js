const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { callWebhook } = require('../utils/webhooks');

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const email = `${phone}@app.com`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const email = `${phone}@app.com`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        user: data.user
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/auth/signup-worker
router.post('/signup-worker', authMiddleware, async (req, res) => {
  try {
    const {
      full_name,
      skills,
      experience,
      hourly_rate,
      service_areas,
      availability,
      languages,
      about,
      aadhaar_number
    } = req.body;

    const userId = req.user.id;

    // Use service role client to insert into profiles
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name,
        role: 'worker'
      })
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      return res.status(400).json({ success: false, message: profileError.message });
    }

    // Insert into worker_profiles
    const { data: workerData, error: workerError } = await supabase
      .from('worker_profiles')
      .insert({
        id: userId,
        skills,
        experience,
        hourly_rate,
        service_areas,
        availability,
        languages,
        about,
        aadhaar_number,
        status: 'pending_verification'
      })
      .select()
      .single();

    if (workerError) {
      return res.status(400).json({ success: false, message: workerError.message });
    }

    // Trigger n8n webhook
    callWebhook('worker_signup_completed', { 
      worker_id: userId, 
      full_name, 
      skills, 
      hourly_rate 
    });

    res.json({
      success: true,
      profile: {
        ...profileData,
        worker_profile: workerData
      }
    });
  } catch (error) {
    console.error('Signup worker error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/auth/signup-customer
router.post('/signup-customer', authMiddleware, async (req, res) => {
  try {
    const { full_name, area, pin_code, email } = req.body;
    const userId = req.user.id;

    // Use service role client to insert into profiles
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name,
        area,
        pin_code,
        email,
        role: 'customer'
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    // Trigger n8n webhook
    callWebhook('customer_signup_completed', { 
      customer_id: userId, 
      full_name, 
      area 
    });

    res.json({
      success: true,
      profile: data
    });
  } catch (error) {
    console.error('Signup customer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch base profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      return res.status(400).json({ success: false, message: profileError.message });
    }

    let result = { user: req.user, profile: profile || null };

    // Fetch worker profile if role is worker
    if (profile && profile.role === 'worker') {
      const { data: workerProfile, error: workerError } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
        
      if (!workerError && workerProfile) {
        result.worker_profile = workerProfile;
      }
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
