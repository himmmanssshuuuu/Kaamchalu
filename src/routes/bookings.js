const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const { callWebhook: triggerWebhook } = require('../utils/webhooks');

const getUserRole = async (userId) => {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return data?.role || null;
};

// GET /api/bookings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const role = await getUserRole(req.user.id);

    let query = supabase
      .from('bookings')
      .select(`
        *,
        job:job_id(*),
        customer:customer_id(id, full_name, phone, avatar_url),
        worker:worker_id(id, full_name, phone, avatar_url)
      `, { count: 'exact' });

    if (role !== 'admin') {
      query = query.or(`customer_id.eq.${req.user.id},worker_id.eq.${req.user.id}`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    // Sanitize phone numbers based on status
    const sanitizedData = data.map(booking => {
       const b = { ...booking };
       const canSeePhone = ['confirmed', 'in_progress', 'completed'].includes(b.status) || role === 'admin';
       
       if (b.customer && (!canSeePhone && b.customer.id !== req.user.id)) {
           delete b.customer.phone;
       }
       if (b.worker && (!canSeePhone && b.worker.id !== req.user.id)) {
           delete b.worker.phone;
       }
       return b;
    });

    res.json({ success: true, data: sanitizedData, count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('GET /bookings error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/bookings/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await getUserRole(req.user.id);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        *,
        job:job_id(*),
        customer:customer_id(id, full_name, phone, avatar_url),
        worker:worker_id(id, full_name, phone, avatar_url)
      `)
      .eq('id', id)
      .single();

    if (error || !booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const isParty = booking.customer_id === req.user.id || booking.worker_id === req.user.id;
    if (!isParty && role !== 'admin') {
       return res.status(403).json({ success: false, message: 'Forbidden: You do not have access to this booking.' });
    }

    // Attempt to get ratings connected to this service
    const { data: review } = await supabase
      .from('reviews')
      .select('*')
      .eq('worker_id', booking.worker_id)
      .eq('customer_id', booking.customer_id)
      .eq('job_id', booking.job_id)
      .maybeSingle();

    booking.review = review || null;

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('GET /bookings/:id error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// PATCH /api/bookings/:id
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; 

    if (!['start', 'complete', 'cancel', 'dispute'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action parameter' });
    }

    const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (error || !booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const isCustomer = booking.customer_id === req.user.id;
    const isWorker = booking.worker_id === req.user.id;
    
    if (!isCustomer && !isWorker) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const updates = {};
    let webhookEvent = null;

    if (action === 'start') {
      if (!isWorker) return res.status(403).json({ success: false, message: 'Only worker can start the job' });
      if (booking.status !== 'confirmed') return res.status(400).json({ success: false, message: 'Can only start a confirmed booking' });
      
      updates.status = 'in_progress';
      updates.actual_start = new Date().toISOString();
      webhookEvent = 'booking_started';
    } 
    else if (action === 'complete') {
      if (!isWorker) return res.status(403).json({ success: false, message: 'Only worker can mark job as complete' });
      if (booking.status !== 'in_progress') return res.status(400).json({ success: false, message: 'Can only complete an in-progress booking' });
      
      updates.status = 'completed';
      updates.actual_end = new Date().toISOString();
      webhookEvent = 'booking_completed';
    }
    else if (action === 'cancel') {
      if (['cancelled', 'completed'].includes(booking.status)) {
        return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} booking` });
      }
      updates.status = 'cancelled';
      webhookEvent = 'booking_cancelled';
    }
    else if (action === 'dispute') {
      if (['cancelled'].includes(booking.status)) {
        return res.status(400).json({ success: false, message: `Cannot dispute a ${booking.status} booking` });
      }
      updates.status = 'disputed';
      webhookEvent = 'booking_disputed';
    }

    const { data: updatedBooking, error: updateErr } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Trigger webhook async safely
    triggerWebhook(webhookEvent, { booking_id: id, booking_status: updates.status, action_by: req.user.id, reason });

    res.json({ success: true, data: updatedBooking });
  } catch (error) {
    console.error('PATCH /bookings/:id error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

module.exports = router;
