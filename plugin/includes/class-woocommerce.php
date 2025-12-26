<?php
/**
 * WooCommerce integration class
 */

if (!defined('ABSPATH')) {
    exit;
}

class OneFunders_Analytics_WooCommerce {
    
    private $api_client;
    
    public function __construct() {
        $this->api_client = new OneFunders_Analytics_API_Client();
        
        // Check if WooCommerce is active
        if (class_exists('WooCommerce')) {
            add_action('woocommerce_order_status_completed', array($this, 'handle_order_completed'), 10, 1);
        }
    }
    
    /**
     * Handle WooCommerce order completion
     */
    public function handle_order_completed($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }
        
        // Get account details from order meta
        $login = $order->get_meta('_onefunders_login');
        $server = $order->get_meta('_onefunders_server');
        $investor_password = $order->get_meta('_onefunders_investor_password');
        $account_type = $order->get_meta('_onefunders_account_type');
        
        if (!$login || !$server || !$investor_password) {
            // Missing required fields
            return;
        }
        
        // Map account_type to plan_id
        $plan_id = $this->map_account_type_to_plan($account_type);
        
        // Backend now handles upsert automatically (create or update by login+server)
        // Just send the account data - backend will update if exists, create if new
        $result = $this->api_client->create_account(array(
            'wp_user_id' => $order->get_user_id(),
            'login' => $login,
            'server' => $server,
            'investor_password' => $investor_password,
            'plan_id' => $plan_id,
        ));
        
        if (isset($result['error'])) {
            error_log('OneFunders: Failed to sync account from order ' . $order_id . ': ' . $result['error']['message']);
        } else {
            // Update or insert in local cache
            global $wpdb;
            $table_accounts = $wpdb->prefix . 'onefunders_accounts';
            $existing = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM $table_accounts WHERE login = %s AND server = %s",
                    $login,
                    $server
                )
            );
            
            if ($existing) {
                // Update existing local record
                $wpdb->update(
                    $table_accounts,
                    array(
                        'plan_id' => $plan_id,
                        'updated_at' => current_time('mysql'),
                    ),
                    array('id' => $existing->id),
                    array('%d', '%s'),
                    array('%d')
                );
            } else {
                // Insert new local record
                $wpdb->insert(
                    $table_accounts,
                    array(
                        'wp_user_id' => $order->get_user_id(),
                        'login' => $login,
                        'server' => $server,
                        'plan_id' => $plan_id,
                        'is_failed' => 0,
                        'created_at' => current_time('mysql'),
                        'updated_at' => current_time('mysql'),
                    ),
                    array('%d', '%s', '%s', '%d', '%d', '%s', '%s')
                );
            }
        }
    }
    
    /**
     * Sync all accounts from WooCommerce orders to backend
     */
    public function sync_all_accounts_from_orders() {
        if (!class_exists('WooCommerce')) {
            return array(
                'success' => false,
                'message' => 'WooCommerce is not active',
                'synced' => 0,
                'errors' => array(),
            );
        }
        
        global $wpdb;
        $synced = 0;
        $errors = array();
        
        // Get all completed orders with account meta
        $orders = wc_get_orders(array(
            'status' => 'completed',
            'limit' => -1,
            'meta_query' => array(
                'relation' => 'AND',
                array(
                    'key' => '_onefunders_login',
                    'compare' => 'EXISTS',
                ),
                array(
                    'key' => '_onefunders_server',
                    'compare' => 'EXISTS',
                ),
                array(
                    'key' => '_onefunders_investor_password',
                    'compare' => 'EXISTS',
                ),
            ),
        ));
        
        foreach ($orders as $order) {
            $login = $order->get_meta('_onefunders_login');
            $server = $order->get_meta('_onefunders_server');
            $investor_password = $order->get_meta('_onefunders_investor_password');
            $account_type = $order->get_meta('_onefunders_account_type');
            
            if (!$login || !$server || !$investor_password) {
                continue;
            }
            
            // Check if account already exists
            $table_accounts = $wpdb->prefix . 'onefunders_accounts';
            $existing = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM $table_accounts WHERE login = %s AND server = %s",
                    $login,
                    $server
                )
            );
            
            // Map account_type to plan_id
            $plan_id = $this->map_account_type_to_plan($account_type);
            
            // Backend now handles upsert automatically (create or update by login+server)
            // Just send the account data - backend will update if exists, create if new
            $result = $this->api_client->create_account(array(
                'wp_user_id' => $order->get_user_id(),
                'login' => $login,
                'server' => $server,
                'investor_password' => $investor_password,
                'plan_id' => $plan_id,
            ));
            
            if (isset($result['error'])) {
                $errors[] = "Order #{$order->get_id()}: " . $result['error']['message'];
            } else {
                // Update or insert in local cache
                $account_data = $result['account'];
                $backend_id = $account_data['id'] ?? null;
                
                if ($existing) {
                    // Update existing local record
                    $wpdb->update(
                        $table_accounts,
                        array(
                            'plan_id' => $plan_id,
                            'updated_at' => current_time('mysql'),
                        ),
                        array('id' => $existing->id),
                        array('%d', '%s'),
                        array('%d')
                    );
                } else {
                    // Insert new local record
                    $wpdb->insert(
                        $table_accounts,
                        array(
                            'wp_user_id' => $order->get_user_id(),
                            'login' => $login,
                            'server' => $server,
                            'plan_id' => $plan_id,
                            'is_failed' => 0,
                            'created_at' => current_time('mysql'),
                            'updated_at' => current_time('mysql'),
                        ),
                        array('%d', '%s', '%s', '%d', '%d', '%s', '%s')
                    );
                }
                $synced++;
            }
        }
        
        return array(
            'success' => true,
            'message' => "Synced {$synced} account(s) from WooCommerce orders",
            'synced' => $synced,
            'errors' => $errors,
        );
    }
    
    /**
     * Map account_type from WooCommerce to backend plan_id
     */
    private function map_account_type_to_plan($account_type) {
        if (!$account_type) {
            return null;
        }
        
        global $wpdb;
        
        // First, check mapping table
        $table_mapping = $wpdb->prefix . 'onefunders_account_type_mapping';
        $mapping = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT backend_plan_id FROM $table_mapping WHERE account_type = %s",
                $account_type
            )
        );
        
        if ($mapping) {
            return intval($mapping->backend_plan_id);
        }
        
        // If no mapping, try exact name match with backend plans
        $plans_result = $this->api_client->get_plans();
        if (isset($plans_result['plans'])) {
            foreach ($plans_result['plans'] as $plan) {
                if (strcasecmp($plan['name'], $account_type) === 0) {
                    return intval($plan['id']);
                }
            }
        }
        
        // No match found
        return null;
    }
}

// Initialize if WooCommerce is active
if (class_exists('WooCommerce')) {
    new OneFunders_Analytics_WooCommerce();
}

