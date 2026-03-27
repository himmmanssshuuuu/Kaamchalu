const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const { callWebhook: triggerWebhook } = require('../utils/webhooks');

// Admin Middleware: Ensures user is an admin
const adminMiddleware = async (req, res, next) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden API access. Admin role required.' });
    }
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while enforcing admin role.' });
  }
};

// Mount auth and admin middlewares sequentially for all routes in this file
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // We execute these queries concurrently for performance
    const [
      { data: activeWorkers, count: activeCount },
      { data: pendingWorkers, count: pendingCount },
      { data: suspendedWorkers, count: suspendedCount },
      { data: customers, count: totalCustomers },
      { data: totalReviews },
      { data: allBookings },
      { data: openDisputes, count: openDisputesCount }
    ] = await Promise.all([
      supabase.from('worker_profiles').select('id', { count: 'exact' }).eq('status', 'active'),
      supabase.from('worker_profiles').select('id', { count: 'exact' }).eq('status', 'pending_verification'),
      supabase.from('worker_profiles').select('id', { count: 'exact' }).eq('status', 'suspended'),
      supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'customer'),
      supabase.from('reviews').select('score'),
      supabase.from('bookings').select('status, created_at'),
      supabase.from('disputes').select('id', { count: 'exact' }).eq('status', 'open').catch(() => ({ data: [], count: 0 })) // Fallback if disputes table doesn't exist yet
    ]);

    // Compute Date comparisons
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); 
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    let bookingsToday = 0;
    let bookingsThisWeek = 0;
    let bookingsThisMonth = 0;
    let completedBookings = 0;

    const safeBookings = allBookings || [];
    safeBookings.forEach(b => {
      const bDate = new Date(b.created_at);
      if (bDate >= today) bookingsToday++;
      if (bDate >= startOfWeek) bookingsThisWeek++;
      if (bDate >= startOfMonth) bookingsThisMonth++;
      
      if (b.status === 'completed') completedBookings++;
    });

    const completion_rate = safeBookings.length > 0 
      ? ((completedBookings / safeBookings.length) * 100).toFixed(2) 
      : 0;

    const safeReviews = totalReviews || [];
    const avg_rating = safeReviews.length > 0 
      ? (safeReviews.reduce((sum, r) => sum + r.score, 0) / safeReviews.length).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        total_workers: {
          active: activeCount || 0,
          pending: pendingCount || 0,
          suspended: suspendedCount || 0
        },
        total_customers: totalCustomers || 0,
        bookings: {
          today: bookingsToday,
          this_week: bookingsThisWeek,
          this_month: bookingsThisMonth
        },
        completion_rate: parseFloat(completion_rate),
        avg_rating: parseFloat(avg_rating),
        open_disputes: openDisputesCount !== null ? openDisputesCount : 0
      }
    });

  } catch (error) {
    console.error('GET /admin/dashboard error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/admin/verification-queue
router.get('/verification-queue', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('worker_profiles')
      .select('*, profiles:id(full_name, phone, email, avatar_url)')
      .eq('status', 'pending_verification')
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /admin/verification-queue error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { role, search, status, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('profiles')
      .select('*, worker_profile:worker_profiles(*)', { count: 'exact' });

    if (role) {
      query = query.eq('role', role);
    }
    
    if (search) {
      // Searching full_name or phone. Note: phone might be null.
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Since status belongs to worker_profiles, we can only correctly filter it on the join if using inner joins.
    // If the request requires status filtering, we transition to an inner join on worker_profiles
    if (status) {
       query = supabase
         .from('worker_profiles')
         .select('*, profile:id(*)', { count: 'exact' })
         .eq('status', status);
       
       if (search) {
         query = query.or(`profile.full_name.ilike.%${search}%,profile.phone.ilike.%${search}%`); // Using nested foreign table filter if supported, or falling back
       }
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ success: true, data, count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('GET /admin/users error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/admin/disputes
router.get('/disputes', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // We assume a 'disputes' table exists linking booking_id, or we query bookings explicitly.
    // PRD says: "disputes with booking details and both parties info"
    let query = supabase
      .from('disputes')
      .select(`
        *,
        booking:booking_id(
          *,
          job:job_id(*),
          customer:customer_id(full_name, phone, email),
          worker:worker_id(full_name, phone, email)
        )
      `, { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    let { data, count, error } = await query;
    
    // If table doesn't exist, this fails nicely. 
    if (error && error.code === '42P01') {
       // Fallback: table doesn't exist logically, return 0 rows for now
       return res.json({ success: true, message: 'No disputes table present.', data: [], count: 0, page: parseInt(page), limit: parseInt(limit) });
    } else if (error) {
       throw error;
    }

    res.json({ success: true, data, count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('GET /admin/disputes error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// PATCH /api/admin/disputes/:id
router.patch('/disputes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution, admin_notes } = req.body;

    const updates = {};
    if (status) updates.status = status;
    if (resolution) updates.resolution = resolution;
    if (admin_notes) updates.admin_notes = admin_notes;

    if (status === 'resolved' || resolution) {
       updates.status = 'resolved';
       updates.resolved_at = new Date().toISOString();
       updates.resolved_by = req.user.id;
    }

    const { data: updatedDispute, error } = await supabase
      .from('disputes')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        booking:booking_id(customer_id, worker_id)
      `)
      .single();

    if (error) {
       if (error.code === '42P01') return res.status(404).json({ success: false, message: 'Disputes table missing.' });
       throw error;
    }

    // Trigger n8n webhook notifying both parties
    if (updatedDispute.booking) {
      triggerWebhook('dispute_updated', {
        dispute_id: id,
        status: updates.status,
        resolution,
        customer_id: updatedDispute.booking.customer_id,
        worker_id: updatedDispute.booking.worker_id,
        admin_id: req.user.id
      });
    }

    res.json({ success: true, data: updatedDispute });
  } catch (error) {
    console.error('PATCH /admin/disputes/:id error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

module.exports = router;
