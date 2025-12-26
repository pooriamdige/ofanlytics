<?php
if (!defined('ABSPATH')) {
    exit;
}

global $wpdb;
$api_client = new OneFunders_Analytics_API_Client();

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
    }
}

// Get plans for dropdown
$plans_result = $api_client->get_plans();
$plans = isset($plans_result['plans']) ? $plans_result['plans'] : array();

// Get all accounts from backend (or from local cache)
$table_accounts = $wpdb->prefix . 'onefunders_accounts';
$accounts = $wpdb->get_results("SELECT * FROM $table_accounts ORDER BY id DESC", ARRAY_A);
?>

<div class="wrap">
    <h1>Accounts</h1>
    
    <?php if (isset($success)): ?>
        <div class="notice notice-success"><p><?php echo esc_html($success); ?></p></div>
    <?php endif; ?>
    
    <?php if (isset($error)): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>
    
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
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($accounts as $account): ?>
                <tr>
                    <td><?php echo esc_html($account['id']); ?></td>
                    <td><?php echo esc_html($account['wp_user_id']); ?></td>
                    <td><?php echo esc_html($account['login']); ?></td>
                    <td><?php echo esc_html($account['server']); ?></td>
                    <td><?php echo esc_html($account['plan_id'] ?? 'N/A'); ?></td>
                    <td><?php echo $account['is_failed'] ? 'Yes' : 'No'; ?></td>
                    <td><?php echo esc_html($account['connection_state'] ?? 'unknown'); ?></td>
                    <td><?php echo esc_html($account['monitoring_state'] ?? 'normal'); ?></td>
                    <td>
                        <form method="post" style="display:inline;">
                            <?php wp_nonce_field('onefunders_accounts'); ?>
                            <input type="hidden" name="action" value="toggle_failed" />
                            <input type="hidden" name="account_id" value="<?php echo esc_attr($account['id']); ?>" />
                            <input type="checkbox" name="is_failed" <?php checked($account['is_failed']); ?> onchange="this.form.submit();" />
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

