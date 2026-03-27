const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const authOptional = require('../middleware/authOptional');
const { callWebhook } = require('../utils/webhooks');

// GET /api/workers
router.get('/', async (req, res) => {
  try {
    const { category, area, min_rating, max_rate, sort_by, page = 1, limit = 20 } = req.query;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('worker_profiles')
      .select('*, profiles!inner(full_name, avatar_url)', { count: 'exact' })
      .eq('status', 'active');

    if (category) {
      query = query.contains('skills', [category]);
    }
    if (area) {
      query = query.contains('service_areas', [area]);
    }
    if (min_rating) {
      query = query.gte('avg_rating', parseFloat(min_rating));
    }
    if (max_rate) {
      query = query.lte('hourly_rate', parseFloat(max_rate));
    }

    if (sort_by === 'rating') {
      query = query.order('avg_rating', { ascending: false });
    } else if (sort_by === 'rate') {
      query = query.order('hourly_rate', { ascending: true });
    } else if (sort_by === 'experience') {
      query = query.order('experience', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
       return res.status(400).json({ success: false, message: error.message });
    }

    return res.json({
       success: true,
       data,
       count,
       page: parseInt(page),
       limit: parseInt(limit)
    });
  } catch (error) {
    console.error('GET /workers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/workers/:id
router.get('/:id', authOptional, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch worker profile and joined profiles table
    const { data: worker, error: workerError } = await supabase
      .from('worker_profiles')
      .select('*, profiles(full_name, avatar_url)')
      .eq('id', id)
      .maybeSingle();

    if (workerError || !worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    // Check privacy
    let canView = worker.status === 'active';
    
    if (!canView && req.user) {
      if (req.user.id === id) {
        canView = true;
      } else {
        // Evaluate if user is admin
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', req.user.id)
          .single();
        if (userProfile && userProfile.role === 'admin') {
           canView = true;
        }
      }
    }

    if (!canView) {
      return res.status(403).json({ success: false, message: 'Worker profile is not active' });
    }

    // Fetch reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*, profiles:customer_id(full_name, avatar_url)')
      .eq('worker_id', id)
      .order('created_at', { ascending: false });

    return res.json({
      success: true,
      data: {
        ...worker,
        reviews: reviewsError ? [] : reviews
      }
    });
  } catch (error) {
     console.error('GET /workers/:id error:', error);
     res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/workers/:id
router.patch('/:id', authMiddleware, async (req, res) => {
   try {
     const { id } = req.params;
     if (req.user.id !== id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only update your own worker profile.' });
     }

     const allowedUpdates = { ...req.body };
     // Prevent updating system-managed fields
     delete allowedUpdates.status;
     delete allowedUpdates.avg_rating;
     delete allowedUpdates.total_jobs;
     delete allowedUpdates.verified_at;
     delete allowedUpdates.id;

     if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields provided to update.' });
     }

     const { data, error } = await supabase
       .from('worker_profiles')
       .update(allowedUpdates)
       .eq('id', id)
       .select()
       .single();

     if (error) {
        return res.status(400).json({ success: false, message: error.message });
     }

     return res.json({ success: true, data });
   } catch (error) {
     console.error('PATCH /workers/:id error:', error);
     res.status(500).json({ success: false, message: 'Internal server error' });
   }
});

// PATCH /api/workers/:id/status
router.patch('/:id/status', authMiddleware, async (req, res) => {
   try {
     const { id } = req.params;
     const { status, reason } = req.body;

     if (!['active', 'suspended', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
     }

     // Check if admin
     const { data: userProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .single();
        
     if (profileErr || userProfile?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
     }

     const updatePayload = { status };
     if (status === 'active') {
        updatePayload.verified_at = new Date().toISOString();
     }

     const { data, error } = await supabase
       .from('worker_profiles')
       .update(updatePayload)
       .eq('id', id)
       .select()
       .single();

     if (error) {
       return res.status(400).json({ success: false, message: error.message });
     }

      // Trigger n8n webhooks
      if (status === 'active') {
        callWebhook('worker_approved', { workerId: id, adminId: req.user.id });
      }
      callWebhook('worker_status_updated', { workerId: id, status, reason, updatedBy: req.user.id });

     return res.json({ success: true, data });
   } catch (error) {
     console.error('PATCH /workers/:id/status error:', error);
     res.status(500).json({ success: false, message: 'Internal server error' });
   }
});

module.exports = router;
