<?php
if (!defined('ABSPATH')) {
    exit;
}

global $wpdb;
$api_client = new OneFunders_Analytics_API_Client();

// Handle connect action
if (isset($_POST['action']) && $_POST['action'] === 'connect_account') {
    check_admin_referer('onefunders_accounts_connect');
    
    $order_id = intval($_POST['order_id']);
    $login = sanitize_text_field($_POST['login']);
    $investor_password = sanitize_text_field($_POST['investor_password']);
    $server = sanitize_text_field($_POST['server']);
    $wp_user_id = intval($_POST['wp_user_id']);
    $plan_id = !empty($_POST['plan_id']) ? intval($_POST['plan_id']) : null;
    
    $result = $api_client->connect_account(array(
        'wp_user_id' => $wp_user_id,
        'login' => $login,
        'investor_password' => $investor_password,
        'server' => $server,
        'plan_id' => $plan_id,
    ));
    
    if (isset($result['error'])) {
        $error = $result['error']['message'];
        // Store error in order meta
        $order = wc_get_order($order_id);
        if ($order) {
            $order->update_meta_data('_onefunders_connection_error', $error);
            $order->update_meta_data('_onefunders_is_connected', '0');
            $order->save();
        }
    } else {
        $success = 'Account connected successfully';
        // Store hash and account_id in order meta
        $order = wc_get_order($order_id);
        if ($order) {
            $order->update_meta_data('_onefunders_hash', $result['account']['hash']);
            $order->update_meta_data('_onefunders_account_id', $result['account']['id']);
            $order->update_meta_data('_onefunders_is_connected', '1');
            $order->update_meta_data('_onefunders_connection_error', '');
            $order->update_meta_data('_onefunders_connected_at', current_time('mysql'));
            $order->save();
        }
        
        // Update local cache
        $table_accounts = $wpdb->prefix . 'onefunders_accounts';
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_accounts WHERE login = %s AND server = %s",
            $login,
            $server
        ));
        
        if ($existing) {
            $wpdb->update(
                $table_accounts,
                array(
                    'backend_account_id' => $result['account']['id'],
                    'hash' => $result['account']['hash'],
                    'plan_id' => $plan_id,
                    'is_connected' => 1,
                    'connection_error' => null,
                    'connected_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql'),
                ),
                array('id' => $existing->id),
                array('%d', '%s', '%d', '%d', '%s', '%s', '%s'),
                array('%d')
            );
        } else {
            $wpdb->insert(
                $table_accounts,
                array(
                    'wp_user_id' => $wp_user_id,
                    'login' => $login,
                    'server' => $server,
                    'backend_account_id' => $result['account']['id'],
                    'hash' => $result['account']['hash'],
                    'plan_id' => $plan_id,
                    'is_connected' => 1,
                    'connected_at' => current_time('mysql'),
                    'order_id' => $order_id,
                    'created_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql'),
                ),
                array('%d', '%s', '%s', '%d', '%s', '%d', '%d', '%s', '%d', '%s', '%s')
            );
        }
    }
}

// Get all accounts from WooCommerce orders
$accounts = array();
if (class_exists('WooCommerce')) {
    $orders = wc_get_orders(array(
        'limit' => -1,
        'status' => 'any',
    ));
    
    foreach ($orders as $order) {
        // Try both prefixed and non-prefixed meta keys
        $login = $order->get_meta('_onefunders_login');
        if (!$login) {
            $login = $order->get_meta('login');
        }
        
        $server = $order->get_meta('_onefunders_server');
        if (!$server) {
            $server = $order->get_meta('server');
        }
        
        // Try investor_password first, then master_pass as fallback
        $investor_password = $order->get_meta('_onefunders_investor_password');
        if (!$investor_password) {
            $investor_password = $order->get_meta('investor_password');
        }
        if (!$investor_password) {
            $investor_password = $order->get_meta('master_pass'); // Use master_pass as fallback
        }
        
        if ($login && $server && $investor_password) {
            $key = $login . '|' . $server;
            if (!isset($accounts[$key])) {
                // Get account_type
                $account_type = $order->get_meta('_onefunders_account_type');
                if (!$account_type) {
                    $account_type = $order->get_meta('account_type');
                }
                
                $accounts[$key] = array(
                    'order_id' => $order->get_id(),
                    'wp_user_id' => $order->get_user_id(),
                    'login' => $login,
                    'server' => $server,
                    'investor_password' => $investor_password,
                    'account_type' => $account_type,
                    'hash' => $order->get_meta('_onefunders_hash'),
                    'account_id' => $order->get_meta('_onefunders_account_id'),
                    'is_connected' => $order->get_meta('_onefunders_is_connected') === '1',
                    'connection_error' => $order->get_meta('_onefunders_connection_error'),
                    'connected_at' => $order->get_meta('_onefunders_connected_at'),
                );
            }
        }
    }
}

// Get plans for mapping
$plans_result = $api_client->get_plans();
$plans = isset($plans_result['plans']) ? $plans_result['plans'] : array();
$plans_by_name = array();
foreach ($plans as $plan) {
    $plans_by_name[$plan['name']] = $plan;
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
    
    <?php if (empty($accounts)): ?>
        <div class="notice notice-warning">
            <p><strong>No accounts found in WooCommerce orders.</strong></p>
            <p>Debug info:</p>
            <ul>
                <li>WooCommerce active: <?php echo class_exists('WooCommerce') ? 'Yes' : 'No'; ?></li>
                <li>Total orders checked: <?php echo isset($orders) ? count($orders) : 0; ?></li>
            </ul>
            <?php if (class_exists('WooCommerce') && isset($orders) && count($orders) > 0): ?>
                <p>Sample order meta keys (first order):</p>
                <pre><?php 
                $sample_order = $orders[0];
                $all_meta = $sample_order->get_meta_data();
                foreach ($all_meta as $meta) {
                    $value = $meta->value;
                    // Mask passwords
                    if (stripos($meta->key, 'pass') !== false || stripos($meta->key, 'password') !== false) {
                        $value = str_repeat('*', min(strlen($value), 10));
                    }
                    echo esc_html($meta->key . ' = ' . $value) . "\n";
                }
                ?></pre>
            <?php endif; ?>
        </div>
    <?php else: ?>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Login</th>
                    <th>Order ID</th>
                    <th>Hash</th>
                    <th>Plan ID</th>
                    <th>Connect</th>
                    <th>Connection Status</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($accounts as $account): ?>
                    <?php
                    // Find plan ID from account_type
                    $plan_id = null;
                    if ($account['account_type'] && isset($plans_by_name[$account['account_type']])) {
                        $plan_id = $plans_by_name[$account['account_type']]['id'];
                    }
                    ?>
                    <tr>
                        <td><?php echo esc_html($account['account_id'] ?? '—'); ?></td>
                        <td><?php echo esc_html($account['login']); ?></td>
                        <td><?php echo esc_html($account['order_id']); ?></td>
                        <td>
                            <?php if ($account['hash']): ?>
                                <code><?php echo esc_html(substr($account['hash'], 0, 20)) . '...'; ?></code>
                            <?php else: ?>
                                —
                            <?php endif; ?>
                        </td>
                        <td><?php echo esc_html($plan_id ?? '—'); ?></td>
                        <td>
                            <?php if (!$account['is_connected']): ?>
                                <form method="post" action="" style="display:inline;">
                                    <?php wp_nonce_field('onefunders_accounts_connect'); ?>
                                    <input type="hidden" name="action" value="connect_account" />
                                    <input type="hidden" name="order_id" value="<?php echo esc_attr($account['order_id']); ?>" />
                                    <input type="hidden" name="wp_user_id" value="<?php echo esc_attr($account['wp_user_id']); ?>" />
                                    <input type="hidden" name="login" value="<?php echo esc_attr($account['login']); ?>" />
                                    <input type="hidden" name="investor_password" value="<?php echo esc_attr($account['investor_password']); ?>" />
                                    <input type="hidden" name="server" value="<?php echo esc_attr($account['server']); ?>" />
                                    <input type="hidden" name="plan_id" value="<?php echo esc_attr($plan_id ?? ''); ?>" />
                                    <button type="submit" class="button button-primary">Connect</button>
                                </form>
                            <?php else: ?>
                                <span style="color: green;">Connected</span>
                                <br>
                                <small><?php echo esc_html($account['connected_at'] ?? ''); ?></small>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if ($account['is_connected']): ?>
                                <span style="color: green;">Connected</span>
                            <?php elseif ($account['connection_error']): ?>
                                <span style="color: red;">Error: <?php echo esc_html($account['connection_error']); ?></span>
                            <?php else: ?>
                                <span>Not Connected</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

