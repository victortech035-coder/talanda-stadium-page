/**
 * Vercel Speed Insights Initialization
 * Automatically tracks web vitals and performance metrics
 * 
 * This script initializes Vercel Speed Insights for the application.
 * It will automatically track Core Web Vitals and other performance metrics
 * when the site is deployed to Vercel.
 */

(function() {
    // Initialize the Speed Insights queue
    window.si = window.si || function() {
        (window.siq = window.siq || []).push(arguments);
    };
})();
