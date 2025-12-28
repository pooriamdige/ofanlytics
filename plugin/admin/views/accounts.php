<?php
if (!defined('ABSPATH')) {
    exit;
}

global $wpdb;
$api_client = new OneFunders_Analytics_API_Client();
$woocommerce = new OneFunders_Analytics_WooCommerce();

// Handle form submissions
if (isset($_POST['action'])) {
    check_admin_referer('onefunders_accounts');
    
    if ($_POST['action'] === 'create') {
        $result = $api_client->create_account(array(
            'wp_user_id' => intval($_POST['wp_user_id']),
            'login' => sanitize_text_field($_POST['login']),
            'server' => sanitize_text_field($_POST['server']),
            'investor_password' => sanitize_text_field($_POST['investor_password']),
            'plan_id' => intval($_POST['plan_id']),
        ));
        
        if (isset($result['error'])) {
            $error = $result['error']['message'];
        } else {
            $success = 'Account created successfully';
            // Also store in local cache
            $table_accounts = $wpdb->prefix . 'onefunders_accounts';
            $wpdb->insert(
                $table_accounts,
                array(
                    'wp_user_id' => intval($_POST['wp_user_id']),
                    'login' => sanitize_text_field($_POST['login']),
                    'server' => sanitize_text_field($_POST['server']),
                    'plan_id' => intval($_POST['plan_id']),
                    'is_failed' => 0,
                    'created_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql'),
                ),
                array('%d', '%s', '%s', '%d', '%d', '%s', '%s')
            );
        }
    } elseif ($_POST['action'] === 'toggle_failed') {
        $result = $api_client->update_account(intval($_POST['account_id']), array(
            'is_failed' => isset($_POST['is_failed']),
            'failure_reason' => sanitize_text_field($_POST['failure_reason'] ?? ''),
        ));
        
        if (isset($result['error'])) {
            $error = $result['error']['message'];
        } else {
            $success = 'Account updated successfully';
        }
    } elseif ($_POST['action'] === 'sync_from_orders') {
        $sync_result = $woocommerce->sync_all_accounts_from_orders();
        if ($sync_result['success']) {
            $success = $sync_result['message'];
            if (!empty($sync_result['errors'])) {
                $error = 'Some accounts had errors: ' . implode('; ', array_slice($sync_result['errors'], 0, 5));
                if (count($sync_result['errors']) > 5) {
                    $error .= ' (and ' . (count($sync_result['errors']) - 5) . ' more)';
                }
            }
            if (isset($sync_result['removed_from_local']) && $sync_result['removed_from_local'] > 0) {
                $success .= ' (Removed ' . $sync_result['removed_from_local'] . ' from local cache)';
            }
        } else {
            $error = $sync_result['message'];
        }
    } elseif ($_POST['action'] === 'check_connectivity') {
        $connectivity = $api_client->check_connectivity();
        if ($connectivity['success']) {
            $success = 'Backend connectivity: ' . $connectivity['message'] . ' (Database: ' . ($connectivity['database'] ?? 'unknown') . ')';
        } else {
            $error = 'Backend connectivity failed: ' . $connectivity['message'];
        }
    }
}

// Get plans for dropdown
$plans_result = $api_client->get_plans();
$plans = isset($plans_result['plans']) ? $plans_result['plans'] : array();

// Get accounts from local cache (synced from WooCommerce orders)
$table_accounts = $wpdb->prefix . 'onefunders_accounts';
$local_accounts = $wpdb->get_results("SELECT * FROM $table_accounts ORDER BY id DESC", ARRAY_A);

// Get accounts from backend API to merge status/state information
$all_accounts_from_backend = array();
$user_ids = array();

// Collect user IDs from local cache
if (!empty($local_accounts)) {
    $user_ids = array_unique(array_column($local_accounts, 'wp_user_id'));
}

// Also check WooCommerce orders for any accounts we might have missed
if (class_exists('WooCommerce') && empty($local_accounts)) {
    $orders = wc_get_orders(array(
        'limit' => -1,
        'status' => 'any',
    ));
    foreach ($orders as $order) {
        $user_id = $order->get_user_id();
        $login = $order->get_meta('_onefunders_login');
        $server = $order->get_meta('_onefunders_server');
        if ($user_id && $login && $server && !in_array($user_id, $user_ids)) {
            $user_ids[] = $user_id;
        }
    }
}

// Fetch accounts from backend for each user
foreach ($user_ids as $user_id) {
    if (!$user_id) continue;
    $backend_result = $api_client->get_accounts($user_id);
    if (isset($backend_result['accounts']) && is_array($backend_result['accounts'])) {
        $all_accounts_from_backend = array_merge($all_accounts_from_backend, $backend_result['accounts']);
    }
}

// Merge local cache with backend data
// Use local cache as base (source of truth from WooCommerce), enrich with backend status
$accounts = array();
$backend_accounts_by_key = array();
foreach ($all_accounts_from_backend as $backend_account) {
    $key = ($backend_account['login'] ?? '') . '|' . ($backend_account['server'] ?? '');
    $backend_accounts_by_key[$key] = $backend_account;
}

foreach ($local_accounts as $local_account) {
    $key = $local_account['login'] . '|' . $local_account['server'];
    if (isset($backend_accounts_by_key[$key])) {
        // Merge: use local cache data but enrich with backend status/state
        $merged = array_merge($local_account, $backend_accounts_by_key[$key]);
        $merged['id'] = $backend_accounts_by_key[$key]['id']; // Use backend ID
        $accounts[] = $merged;
    } else {
        // Account exists in local cache but not in backend - show it anyway
        $accounts[] = $local_account;
    }
}

// If no accounts found, show message
if (empty($accounts) && empty($local_accounts)) {
    // Try to show accounts from WooCommerce orders directly
    if (class_exists('WooCommerce')) {
        $orders = wc_get_orders(array(
            'limit' => -1,
            'status' => 'any',
        ));
        $accounts_from_orders = array();
        foreach ($orders as $order) {
            $login = $order->get_meta('_onefunders_login');
            $server = $order->get_meta('_onefunders_server');
            $account_type = $order->get_meta('_onefunders_account_type');
            $investor_password = $order->get_meta('_onefunders_investor_password');
            
            if ($login && $server && $account_type && $investor_password) {
                $key = $login . '|' . $server;
                if (!isset($accounts_from_orders[$key])) {
                    $accounts_from_orders[$key] = array(
                        'id' => null,
                        'wp_user_id' => $order->get_user_id(),
                        'login' => $login,
                        'server' => $server,
                        'plan_id' => null,
                        'is_failed' => false,
                        'connection_state' => 'not_synced',
                        'monitoring_state' => 'normal',
                        'last_seen' => null,
                    );
                }
            }
        }
        if (!empty($accounts_from_orders)) {
            $accounts = array_values($accounts_from_orders);
        }
    }
}
?>

<div class="wrap">
    <h1>Accounts</h1>
    
    <?php if (isset($success)): ?>
        <div class="notice notice-success"><p><?php echo esc_html($success); ?></p></div>
    <?php endif; ?>
    
    <?php if (isset($error)): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>
    
    <div style="margin: 20px 0;">
        <form method="post" action="" style="display: inline-block; margin-right: 10px;">
            <?php wp_nonce_field('onefunders_accounts'); ?>
            <input type="hidden" name="action" value="check_connectivity" />
            <button type="submit" class="button button-secondary">Check Backend Connectivity</button>
        </form>
        
        <?php if (class_exists('WooCommerce')): ?>
            <form method="post" action="" style="display: inline-block;">
                <?php wp_nonce_field('onefunders_accounts'); ?>
                <input type="hidden" name="action" value="sync_from_orders" />
                <button type="submit" class="button button-primary">Sync All Accounts from WooCommerce Orders</button>
            </form>
        <?php endif; ?>
    </div>
    
    <h2>Create New Account</h2>
    <form method="post" action="">
        <?php wp_nonce_field('onefunders_accounts'); ?>
        <input type="hidden" name="action" value="create" />
        <table class="form-table">
            <tr>
                <th><label for="wp_user_id">WordPress User ID</label></th>
                <td><input type="number" id="wp_user_id" name="wp_user_id" required class="small-text" /></td>
            </tr>
            <tr>
                <th><label for="login">Login</label></th>
                <td><input type="text" id="login" name="login" required class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="server">Server</label></th>
                <td><input type="text" id="server" name="server" required class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="investor_password">Investor Password</label></th>
                <td><input type="password" id="investor_password" name="investor_password" required class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="plan_id">Plan</label></th>
                <td>
                    <select id="plan_id" name="plan_id">
                        <option value="">None</option>
                        <?php foreach ($plans as $plan): ?>
                            <option value="<?php echo esc_attr($plan['id']); ?>"><?php echo esc_html($plan['name']); ?></option>
                        <?php endforeach; ?>
                    </select>
                </td>
            </tr>
        </table>
        <?php submit_button('Create Account'); ?>
    </form>
    
    <h2>Existing Accounts</h2>
    <?php if (empty($accounts)): ?>
        <p>No accounts found. Use "Sync All Accounts from WooCommerce Orders" to import accounts from completed orders.</p>
    <?php else: ?>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>WP User ID</th>
                    <th>Login</th>
                    <th>Server</th>
                    <th>Plan</th>
                    <th>Failed</th>
                    <th>Connection State</th>
                    <th>Monitoring State</th>
                    <th>Last Seen</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($accounts as $account): ?>
                    <tr>
                        <td><?php echo esc_html($account['id'] ?? $account['ID'] ?? 'N/A'); ?></td>
                        <td><?php echo esc_html($account['wp_user_id'] ?? 'N/A'); ?></td>
                        <td><?php echo esc_html($account['login'] ?? 'N/A'); ?></td>
                        <td><?php echo esc_html($account['server'] ?? 'N/A'); ?></td>
                        <td>
                            <?php 
                            $plan_id = $account['plan_id'] ?? null;
                            if ($plan_id) {
                                foreach ($plans as $plan) {
                                    if ($plan['id'] == $plan_id) {
                                        echo esc_html($plan['name']);
                                        break;
                                    }
                                }
                                if (!$plan) {
                                    echo esc_html($plan_id);
                                }
                            } else {
                                echo 'N/A';
                            }
                            ?>
                        </td>
                        <td><?php echo ($account['is_failed'] ?? false) ? '<span style="color: red;">Yes</span>' : 'No'; ?></td>
                        <td><?php echo esc_html($account['connection_state'] ?? 'unknown'); ?></td>
                        <td><?php echo esc_html($account['monitoring_state'] ?? 'normal'); ?></td>
                        <td><?php echo isset($account['last_seen']) ? esc_html($account['last_seen']) : 'Never'; ?></td>
                        <td>
                            <form method="post" style="display:inline;">
                                <?php wp_nonce_field('onefunders_accounts'); ?>
                                <input type="hidden" name="action" value="toggle_failed" />
                                <input type="hidden" name="account_id" value="<?php echo esc_attr($account['id'] ?? $account['ID'] ?? ''); ?>" />
                                <input type="checkbox" name="is_failed" <?php checked($account['is_failed'] ?? false); ?> onchange="this.form.submit();" title="Toggle Failed Status" />
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

