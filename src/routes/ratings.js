const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const { callWebhook: triggerWebhook } = require('../utils/webhooks');

const getUserRole = async (userId) => {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return data?.role || null;
};

// POST /api/ratings
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { booking_id, score, review_text } = req.body;

    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ success: false, message: 'Score must be between 1 and 5' });
    }

    // Get booking
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('customer_id, worker_id, status, job_id')
      .eq('id', booking_id)
      .single();

    if (bookingErr || !booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Rating is only allowed for completed bookings' });
    }

    const isCustomer = booking.customer_id === req.user.id;
    const isWorker = booking.worker_id === req.user.id;

    if (!isCustomer && !isWorker) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not part of this booking' });
    }

    const reviewer_id = req.user.id;
    const rated_user_id = isCustomer ? booking.worker_id : booking.customer_id;

    // Check if already rated
    const { data: existingRating } = await supabase
      .from('reviews')
      .select('id')
      .eq('booking_id', booking_id)
      .eq('reviewer_id', reviewer_id)
      .maybeSingle();

    if (existingRating) {
      return res.status(400).json({ success: false, message: 'You have already rated this booking' });
    }

    // Create rating
    const { data: newRating, error: insertErr } = await supabase
      .from('reviews')
      .insert({
        booking_id,
        job_id: booking.job_id,
        worker_id: booking.worker_id,
        customer_id: booking.customer_id,
        reviewer_id,
        rated_user_id,
        score,
        review_text,
        is_flagged: false
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // If a worker was rated, update their average rating dynamically
    if (isCustomer && booking.worker_id) {
       const { data: allReviews } = await supabase
         .from('reviews')
         .select('score')
         .eq('rated_user_id', booking.worker_id);
       
       if (allReviews && allReviews.length > 0) {
          const avg_rating = allReviews.reduce((acc, curr) => acc + curr.score, 0) / allReviews.length;
          const total_jobs = allReviews.length;

          await supabase
            .from('worker_profiles')
            .update({ avg_rating, total_jobs })
            .eq('id', booking.worker_id);
       }
    }

    // Trigger webhook async
    triggerWebhook('rating_submitted', { rating_id: newRating.id, rated_user_id, reviewer_id, score });

    res.json({ success: true, data: newRating });
  } catch (error) {
    console.error('POST /ratings error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/ratings
router.get('/', authMiddleware, async (req, res) => {
  try {
     const { user_id, page = 1, limit = 20 } = req.query;
     const from = (page - 1) * limit;
     const to = from + limit - 1;

     let query = supabase
       .from('reviews')
       .select('*, reviewer:reviewer_id(full_name, avatar_url)', { count: 'exact' });

     if (user_id) {
       query = query.eq('rated_user_id', user_id);
     }

     query = query.order('created_at', { ascending: false }).range(from, to);

     const { data, count, error } = await query;
     if (error) throw error;

     res.json({ success: true, data, count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
     console.error('GET /ratings error:', error);
     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// PATCH /api/ratings/:id/flag
router.patch('/:id/flag', authMiddleware, async (req, res) => {
  try {
     const { id } = req.params;
     const { is_flagged } = req.body;
     const role = await getUserRole(req.user.id);

     if (role !== 'admin') {
       return res.status(403).json({ success: false, message: 'Admin access required to flag content' });
     }

     const { data, error } = await supabase
       .from('reviews')
       .update({ is_flagged: !!is_flagged })
       .eq('id', id)
       .select()
       .single();

     if (error) throw error;

     res.json({ success: true, data });
  } catch (error) {
     console.error('PATCH /ratings/:id/flag error:', error);
     res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

module.exports = router;
