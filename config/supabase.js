const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

const getSupabase = () => {
    if(supabaseClient) return supabaseClient;

    const url = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!url || !serviceRole) return null;

    supabaseClient = createClient(url, serviceRole, {
        auth: { persistSession: false }
    });

    return supabaseClient;
}

module.exports = getSupabase;
