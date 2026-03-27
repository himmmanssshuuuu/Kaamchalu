const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

// Helper to get user role from profiles
const getUserRole = async (userId) => {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return data?.role || null;
};

const { callWebhook: triggerWebhook } = require('../utils/webhooks');

// POST /api/jobs
router.post('/', authMiddleware, async (req, res) => {
  try {
    const role = await getUserRole(req.user.id);
    if (role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can post jobs' });
    }

    const { category, description, location, pin_code, preferred_date, preferred_time, budget, photo_urls } = req.body;

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        customer_id: req.user.id,
        category,
        description,
        location,
        pin_code,
        preferred_date,
        preferred_time,
        budget,
        photo_urls,
        status: 'posted'
      })
      .select()
      .single();

    if (error) throw error;

    // Trigger webhook
    triggerWebhook('job_posted', { job });

    res.json({ success: true, data: job });
  } catch (error) {
    console.error('POST /jobs error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/jobs
router.get('/', authMiddleware, async (req, res) => {
  try {
    const role = await getUserRole(req.user.id);
    const { status, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('jobs')
      .select('*, customer:customer_id(full_name)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (role === 'customer') {
      query = query.eq('customer_id', req.user.id);
    } else if (role === 'worker') {
      // Worker only sees jobs where they have an application
      const { data: apps } = await supabase.from('job_applications').select('job_id').eq('worker_id', req.user.id);
      const jobIds = apps ? apps.map(a => a.job_id) : [];
      if (jobIds.length === 0) {
        return res.json({ success: true, data: [], count: 0, page: parseInt(page), limit: parseInt(limit) });
      }
      query = query.in('id', jobIds);
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    query = query.order('created_at', { ascending: false }).range(from, to);
    const { data, count, error } = await query;

    if (error) throw error;

    res.json({ success: true, data, count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('GET /jobs error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/jobs/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await getUserRole(req.user.id);

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*, customer:customer_id(full_name, avatar_url)')
      .eq('id', id)
      .single();

    if (error || !job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Auth check
    let canView = false;
    if (role === 'admin') canView = true;
    else if (role === 'customer' && job.customer_id === req.user.id) canView = true;
    else if (role === 'worker' && job.matched_worker_id === req.user.id) canView = true;

    if (!canView) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    let applications = [];
    let booking = null;

    if (role === 'customer' || role === 'admin') {
      const { data: apps } = await supabase
        .from('job_applications')
        .select('*, worker:worker_id(full_name, avatar_url, worker_profile:worker_profiles(avg_rating, total_jobs))')
        .eq('job_id', id);
      applications = apps || [];
    }

    const { data: book } = await supabase.from('bookings').select('*').eq('job_id', id).maybeSingle();
    booking = book || null;

    res.json({ success: true, data: { ...job, applications, booking } });
  } catch (error) {
    console.error('GET /jobs/:id error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// PATCH /api/jobs/:id
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await getUserRole(req.user.id);

    const { data: job, error: jobError } = await supabase.from('jobs').select('*').eq('id', id).single();
    if (jobError || !job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const updates = {};
    if (role === 'customer' && job.customer_id === req.user.id) {
      const { status, description } = req.body;
      if (status === 'cancelled' && ['posted', 'matched'].includes(job.status)) {
        updates.status = 'cancelled';
      }
      if (description) updates.description = description;
    } else if (role === 'admin') {
      const { status, matched_worker_id } = req.body;
      if (status) updates.status = status;
      if (matched_worker_id) updates.matched_worker_id = matched_worker_id;
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden to update this job' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid updates provided' });
    }

    const { data: updatedJob, error: updateErr } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    console.error('PATCH /jobs/:id error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// POST /api/jobs/:id/apply
router.post('/:id/apply', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await getUserRole(req.user.id);

    if (role !== 'worker') {
      return res.status(403).json({ success: false, message: 'Only workers can apply to jobs' });
    }

    // Check job exists and is open
    const { data: job } = await supabase.from('jobs').select('status, customer_id').eq('id', id).single();
    if (!job || job.status !== 'posted') {
      return res.status(400).json({ success: false, message: 'Job is not open for applications' });
    }

    const { data: application, error } = await supabase
      .from('job_applications')
      .insert({
        job_id: id,
        worker_id: req.user.id,
        status: 'accepted' // 'accepted' meaning worker accepts interest
      })
      .select()
      .single();

    if (error) throw error;

    triggerWebhook('worker_applied', { job_id: id, worker_id: req.user.id, customer_id: job.customer_id });

    res.json({ success: true, data: application });
  } catch (error) {
    console.error('POST /jobs/:id/apply error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// POST /api/jobs/:id/confirm
router.post('/:id/confirm', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { worker_id } = req.body;
    const role = await getUserRole(req.user.id);

    if (role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can confirm jobs' });
    }

    const { data: job } = await supabase.from('jobs').select('status, customer_id').eq('id', id).single();
    if (!job || job.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (job.status !== 'posted') {
      return res.status(400).json({ success: false, message: `Job cannot be confirmed from status: ${job.status}` });
    }
    if (!worker_id) {
      return res.status(400).json({ success: false, message: 'worker_id is required' });
    }

    // Update job
    const { data: updatedJob, error: updateErr } = await supabase
      .from('jobs')
      .update({ status: 'confirmed', matched_worker_id: worker_id })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Create booking
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert({
        job_id: id,
        customer_id: req.user.id,
        worker_id: worker_id,
        status: 'confirmed'
      })
      .select()
      .single();

    if (bookErr) throw bookErr;

    // Trigger n8n webhooks
    triggerWebhook('worker_accepted', { job_id: id, worker_id, customer_id: req.user.id });
    triggerWebhook('booking_confirmed', { booking_id: booking.id, job_id: id, customer_id: req.user.id, worker_id });

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('POST /jobs/:id/confirm error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

module.exports = router;
