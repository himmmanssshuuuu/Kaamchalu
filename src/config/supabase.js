const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Create a single supabase client for interacting with your database
// Using the service role key to bypass RLS policies where necessary as per requirements
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
