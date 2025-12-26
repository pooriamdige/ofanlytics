<?php
/**
 * Plugin Name: OneFunders Analytics
 * Plugin URI: https://onefunders.com
 * Description: WordPress plugin for OneFunders Analytics dashboard and account management
 * Version: 1.0.0
 * Author: OneFunders
 * License: GPL v2 or later
 * Text Domain: onefunders-analytics
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ONEFUNDERS_ANALYTICS_VERSION', '1.0.0');
define('ONEFUNDERS_ANALYTICS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('ONEFUNDERS_ANALYTICS_PLUGIN_URL', plugin_dir_url(__FILE__));

// Include required files
require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'includes/class-database.php';
require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'includes/class-api-client.php';
require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'includes/class-admin.php';
require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'includes/class-frontend.php';
require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'includes/class-assets.php';
require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'includes/class-woocommerce.php';

/**
 * Main plugin class
 */
class OneFunders_Analytics {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->init_hooks();
    }
    
    private function init_hooks() {
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
        
        add_action('plugins_loaded', array($this, 'load_components'));
    }
    
    public function activate() {
        $database = new OneFunders_Analytics_Database();
        $database->create_tables();
        
        // Set default options
        if (!get_option('onefunders_analytics_api_url')) {
            update_option('onefunders_analytics_api_url', 'http://localhost:3000');
        }
    }
    
    public function deactivate() {
        // Cleanup if needed
    }
    
    public function load_components() {
        if (is_admin()) {
            new OneFunders_Analytics_Admin();
        }
        
        new OneFunders_Analytics_Frontend();
        new OneFunders_Analytics_Assets();
    }
}

// Initialize plugin
OneFunders_Analytics::get_instance();

