const supabase = require('../config/supabase');

const authOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token, proceed as guest
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = user;
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    console.error('Auth Optional middleware error:', error);
    req.user = null;
    next();
  }
};

module.exports = authOptional;
