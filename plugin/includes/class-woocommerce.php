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
            // Sync on order completion
            add_action('woocommerce_order_status_completed', array($this, 'handle_order_update'), 10, 1);
            // Sync on order update (status change, meta update, etc.)
            add_action('woocommerce_update_order', array($this, 'handle_order_update'), 10, 1);
            // Sync on order meta update
            add_action('woocommerce_order_item_meta_updated', array($this, 'handle_order_update'), 10, 1);
        }
    }
    
    /**
     * Handle WooCommerce order update (completion, status change, meta update)
     */
    public function handle_order_update($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }
        
        // Get account details from order meta
        // Only sync if ALL required fields exist: account_type, login, investor_password, server
        $login = $order->get_meta('_onefunders_login');
        $server = $order->get_meta('_onefunders_server');
        $investor_password = $order->get_meta('_onefunders_investor_password');
        $account_type = $order->get_meta('_onefunders_account_type');
        
        // All fields must exist for sync
        if (!$login || !$server || !$investor_password || !$account_type) {
            // Missing required fields - skip sync
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
     * Sync all accounts from WooCommerce orders to backend and local cache
     * WooCommerce order metas are the source of truth
     * This function ensures WordPress local cache and server DB match WooCommerce orders
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
        $table_accounts = $wpdb->prefix . 'onefunders_accounts';
        
        // Step 1: Get ALL orders (not just completed) - WooCommerce order metas are source of truth
        // We check all orders to find accounts, but only sync if all required fields exist
        $all_orders = wc_get_orders(array(
            'limit' => -1,
            'status' => 'any', // Get all order statuses
        ));
        
        $total_orders = count($all_orders);
        $orders_with_all_fields = 0;
        $orders_missing_fields = 0;
        
        // Step 2: Build list of accounts from WooCommerce orders (source of truth)
        $accounts_from_orders = array(); // Key: login|server, Value: account data
        $account_keys_from_orders = array(); // Track which accounts exist in orders
        
        foreach ($all_orders as $order) {
            $login = $order->get_meta('_onefunders_login');
            $server = $order->get_meta('_onefunders_server');
            $investor_password = $order->get_meta('_onefunders_investor_password');
            $account_type = $order->get_meta('_onefunders_account_type');
            
            // Only process if ALL required fields exist
            if (!$login || !$server || !$investor_password || !$account_type) {
                $orders_missing_fields++;
                continue;
            }
            
            $orders_with_all_fields++;
            
            // Use login|server as unique key
            $account_key = $login . '|' . $server;
            
            // If we already have this account from another order, keep the one with completed status
            if (isset($accounts_from_orders[$account_key])) {
                // Prefer completed orders over other statuses
                if ($order->get_status() === 'completed' && $accounts_from_orders[$account_key]['order_status'] !== 'completed') {
                    $accounts_from_orders[$account_key] = array(
                        'login' => $login,
                        'server' => $server,
                        'investor_password' => $investor_password,
                        'account_type' => $account_type,
                        'wp_user_id' => $order->get_user_id(),
                        'order_id' => $order->get_id(),
                        'order_status' => $order->get_status(),
                    );
                }
            } else {
                // First time seeing this account
                $accounts_from_orders[$account_key] = array(
                    'login' => $login,
                    'server' => $server,
                    'investor_password' => $investor_password,
                    'account_type' => $account_type,
                    'wp_user_id' => $order->get_user_id(),
                    'order_id' => $order->get_id(),
                    'order_status' => $order->get_status(),
                );
                $account_keys_from_orders[] = $account_key;
            }
        }
        
        // Step 3: Sync accounts from WooCommerce to backend and local cache
        foreach ($accounts_from_orders as $account_key => $account_data) {
            // Map account_type to plan_id
            $plan_id = $this->map_account_type_to_plan($account_data['account_type']);
            
            // Sync to backend (backend handles upsert)
            $result = $this->api_client->create_account(array(
                'wp_user_id' => $account_data['wp_user_id'],
                'login' => $account_data['login'],
                'server' => $account_data['server'],
                'investor_password' => $account_data['investor_password'],
                'plan_id' => $plan_id,
            ));
            
            if (isset($result['error'])) {
                $errors[] = "Account {$account_data['login']}/{$account_data['server']} (Order #{$account_data['order_id']}): " . $result['error']['message'];
                continue;
            }
            
            // Sync to local cache
            $existing_local = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM $table_accounts WHERE login = %s AND server = %s",
                    $account_data['login'],
                    $account_data['server']
                )
            );
            
            if ($existing_local) {
                // Update existing local record
                $wpdb->update(
                    $table_accounts,
                    array(
                        'wp_user_id' => $account_data['wp_user_id'],
                        'plan_id' => $plan_id,
                        'updated_at' => current_time('mysql'),
                    ),
                    array('id' => $existing_local->id),
                    array('%d', '%d', '%s'),
                    array('%d')
                );
            } else {
                // Insert new local record
                $wpdb->insert(
                    $table_accounts,
                    array(
                        'wp_user_id' => $account_data['wp_user_id'],
                        'login' => $account_data['login'],
                        'server' => $account_data['server'],
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
        
        // Step 4: Remove accounts from local cache that don't exist in WooCommerce orders anymore
        $all_local_accounts = $wpdb->get_results(
            "SELECT * FROM $table_accounts",
            ARRAY_A
        );
        
        $removed_from_local = 0;
        foreach ($all_local_accounts as $local_account) {
            $local_key = $local_account['login'] . '|' . $local_account['server'];
            if (!in_array($local_key, $account_keys_from_orders)) {
                // This account doesn't exist in WooCommerce orders anymore - remove from local cache
                $wpdb->delete(
                    $table_accounts,
                    array('id' => $local_account['id']),
                    array('%d')
                );
                $removed_from_local++;
            }
        }
        
        // Note: We don't remove from server DB automatically - that should be done manually
        // or through a separate cleanup process, as server DB has additional data (metrics, orders, etc.)
        
        $message = "Synced {$synced} account(s) from WooCommerce orders";
        if ($removed_from_local > 0) {
            $message .= ", removed {$removed_from_local} account(s) from local cache that no longer exist in orders";
        }
        
        // Add debug info if no accounts were synced
        if ($synced === 0) {
            $message .= " (Found {$total_orders} total orders, {$orders_with_all_fields} with all required fields, {$orders_missing_fields} missing required fields)";
        }
        
        return array(
            'success' => true,
            'message' => $message,
            'synced' => $synced,
            'removed_from_local' => $removed_from_local,
            'total_orders' => $total_orders,
            'orders_with_all_fields' => $orders_with_all_fields,
            'orders_missing_fields' => $orders_missing_fields,
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

