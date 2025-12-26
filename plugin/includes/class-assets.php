<?php
/**
 * Assets enqueue class
 */

if (!defined('ABSPATH')) {
    exit;
}

class OneFunders_Analytics_Assets {
    
    public function __construct() {
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }
    
    public function enqueue_frontend_assets() {
        if (has_shortcode(get_post()->post_content ?? '', 'onefunders_analytics_dashboard')) {
            wp_enqueue_style(
                'onefunders-analytics-dashboard',
                ONEFUNDERS_ANALYTICS_PLUGIN_URL . 'frontend/assets/dashboard.css',
                array(),
                ONEFUNDERS_ANALYTICS_VERSION
            );
            
            wp_enqueue_script(
                'onefunders-analytics-dashboard',
                ONEFUNDERS_ANALYTICS_PLUGIN_URL . 'frontend/assets/dashboard.js',
                array('jquery'),
                ONEFUNDERS_ANALYTICS_VERSION,
                true
            );
            
            wp_localize_script('onefunders-analytics-dashboard', 'onefundersAnalytics', array(
                'apiUrl' => get_option('onefunders_analytics_api_url', 'http://localhost:3000'),
                'wpUserId' => get_current_user_id(),
                'nonce' => wp_create_nonce('onefunders_analytics_nonce'),
            ));
        }
    }
    
    public function enqueue_admin_assets($hook) {
        if (strpos($hook, 'onefunders') === false) {
            return;
        }
        
        wp_enqueue_style(
            'onefunders-analytics-admin',
            ONEFUNDERS_ANALYTICS_PLUGIN_URL . 'admin/assets/admin.css',
            array(),
            ONEFUNDERS_ANALYTICS_VERSION
        );
        
        wp_enqueue_script(
            'onefunders-analytics-admin',
            ONEFUNDERS_ANALYTICS_PLUGIN_URL . 'admin/assets/admin.js',
            array('jquery'),
            ONEFUNDERS_ANALYTICS_VERSION,
            true
        );
    }
}

