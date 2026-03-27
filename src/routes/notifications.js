const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

// GET /api/notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { is_read, page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id);
    
    if (is_read !== undefined) {
      // is_read query expects a boolean
      query = query.eq('is_read', is_read === 'true');
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    // Get total unread count for easy badge updates on frontend
    const { count: unread_count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ 
      success: true, 
      data, 
      count, 
      unread_count: unread_count || 0, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (error) {
    console.error('GET /notifications error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const { data: notification, error: notifErr } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .single();

    if (notifErr || !notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden access to this notification' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('PATCH /notifications/:id/read error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false)
      .select();

    if (error) throw error;

    res.json({ success: true, message: 'All notifications marked as read', data });
  } catch (error) {
    console.error('POST /notifications/read-all error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

module.exports = router;
