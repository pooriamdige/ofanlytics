<?php
/**
 * Frontend shortcode class
 */

if (!defined('ABSPATH')) {
    exit;
}

class OneFunders_Analytics_Frontend {
    
    public function __construct() {
        add_shortcode('onefunders_analytics_dashboard', array($this, 'render_dashboard'));
    }
    
    public function render_dashboard($atts) {
        if (!is_user_logged_in()) {
            return '<p>Please log in to view your analytics dashboard.</p>';
        }
        
        ob_start();
        require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'frontend/views/dashboard.php';
        return ob_get_clean();
    }
}

