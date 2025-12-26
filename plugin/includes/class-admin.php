<?php
/**
 * Admin pages class
 */

if (!defined('ABSPATH')) {
    exit;
}

class OneFunders_Analytics_Admin {
    
    private $api_client;
    
    public function __construct() {
        $this->api_client = new OneFunders_Analytics_API_Client();
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
    }
    
    public function add_admin_menu() {
        add_menu_page(
            'OneFunders Analytics',
            'OneFunders',
            'manage_options',
            'onefunders-analytics',
            array($this, 'render_plans_page'),
            'dashicons-chart-line',
            30
        );
        
        add_submenu_page(
            'onefunders-analytics',
            'Plans',
            'Plans',
            'manage_options',
            'onefunders-analytics',
            array($this, 'render_plans_page')
        );
        
        add_submenu_page(
            'onefunders-analytics',
            'Accounts',
            'Accounts',
            'manage_options',
            'onefunders-accounts',
            array($this, 'render_accounts_page')
        );
        
        add_submenu_page(
            'onefunders-analytics',
            'Settings',
            'Settings',
            'manage_options',
            'onefunders-settings',
            array($this, 'render_settings_page')
        );
    }
    
    public function register_settings() {
        register_setting('onefunders_analytics_settings', 'onefunders_analytics_api_url');
    }
    
    public function render_plans_page() {
        require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'admin/views/plans.php';
    }
    
    public function render_accounts_page() {
        require_once ONEFUNDERS_ANALYTICS_PLUGIN_DIR . 'admin/views/accounts.php';
    }
    
    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>OneFunders Analytics Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields('onefunders_analytics_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="onefunders_analytics_api_url">Backend API URL</label>
                        </th>
                        <td>
                            <input type="url" 
                                   id="onefunders_analytics_api_url" 
                                   name="onefunders_analytics_api_url" 
                                   value="<?php echo esc_attr(get_option('onefunders_analytics_api_url', 'http://localhost:3000')); ?>" 
                                   class="regular-text" />
                            <p class="description">URL of the backend API service (e.g., http://localhost:3000)</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}

