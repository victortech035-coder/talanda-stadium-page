const TALANTA_CONFIG = {
    supabaseUrl: "https://cfrlgqslzvwmmhbsnwrq.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmcmxncXNsenZ3bW1oYnNud3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MzQ3MjQsImV4cCI6MjEwOTMxMDcyNH0.1vP2nEAoVsWrk2fJ0sEa_E3BsoZCVjq-9FxOLtdaq6Y",
    apiBaseUrl: ""
};

window.TALANTA_CONFIG = TALANTA_CONFIG;
window.APP_CONFIG = {
    API_BASE_URL: TALANTA_CONFIG.apiBaseUrl || ""
};

if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(
        TALANTA_CONFIG.supabaseUrl,
        TALANTA_CONFIG.supabaseAnonKey
    );
}
