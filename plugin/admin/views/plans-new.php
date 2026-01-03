<?php
if (!defined('ABSPATH')) {
    exit;
}

global $wpdb;
$api_client = new OneFunders_Analytics_API_Client();

// Handle sync action
if (isset($_POST['action']) && $_POST['action'] === 'sync_plan') {
    check_admin_referer('onefunders_plans_sync');
    
    $account_type = sanitize_text_field($_POST['account_type']);
    $daily_dd_percent = floatval($_POST['daily_dd_percent']);
    $max_dd_percent = floatval($_POST['max_dd_percent']);
    $daily_dd_is_floating = isset($_POST['daily_dd_is_floating']);
    $max_dd_is_floating = isset($_POST['max_dd_is_floating']);
    
    $result = $api_client->sync_plan(array(
        'account_type' => $account_type,
        'daily_dd_percent' => $daily_dd_percent,
        'max_dd_percent' => $max_dd_percent,
        'daily_dd_is_floating' => $daily_dd_is_floating,
        'max_dd_is_floating' => $max_dd_is_floating,
    ));
    
        if (isset($result['error'])) {
            $error = $result['error']['message'];
            if (isset($result['error']['raw_response'])) {
                $error .= ' (Response: ' . esc_html($result['error']['raw_response']) . ')';
            }
        } else {
        $success = 'Plan synced successfully';
        // Update local cache
        $table_plans = $wpdb->prefix . 'onefunders_plans';
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_plans WHERE account_type = %s",
            $account_type
        ));
        
        if ($existing) {
            $wpdb->update(
                $table_plans,
                array(
                    'backend_plan_id' => $result['plan']['id'],
                    'daily_dd_percent' => $daily_dd_percent,
                    'max_dd_percent' => $max_dd_percent,
                    'daily_dd_is_floating' => $daily_dd_is_floating ? 1 : 0,
                    'max_dd_is_floating' => $max_dd_is_floating ? 1 : 0,
                    'synced_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql'),
                ),
                array('id' => $existing->id),
                array('%d', '%f', '%f', '%d', '%d', '%s', '%s'),
                array('%d')
            );
        } else {
            $wpdb->insert(
                $table_plans,
                array(
                    'account_type' => $account_type,
                    'backend_plan_id' => $result['plan']['id'],
                    'daily_dd_percent' => $daily_dd_percent,
                    'max_dd_percent' => $max_dd_percent,
                    'daily_dd_is_floating' => $daily_dd_is_floating ? 1 : 0,
                    'max_dd_is_floating' => $max_dd_is_floating ? 1 : 0,
                    'synced_at' => current_time('mysql'),
                    'created_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql'),
                ),
                array('%s', '%d', '%f', '%f', '%d', '%d', '%s', '%s', '%s')
            );
        }
    }
}

// Get unique account_types from WooCommerce orders
$account_types = array();
if (class_exists('WooCommerce')) {
    $orders = wc_get_orders(array(
        'limit' => -1,
        'status' => 'any',
    ));
    
    foreach ($orders as $order) {
        // Try both prefixed and non-prefixed meta keys
        $account_type = $order->get_meta('_onefunders_account_type');
        if (!$account_type) {
            $account_type = $order->get_meta('account_type');
        }
        if ($account_type && !in_array($account_type, $account_types)) {
            $account_types[] = $account_type;
        }
    }
}

// Get synced plans from backend
$backend_plans_result = $api_client->get_plans();
$backend_plans = isset($backend_plans_result['plans']) ? $backend_plans_result['plans'] : array();
$backend_plans_by_name = array();
foreach ($backend_plans as $plan) {
    $backend_plans_by_name[$plan['name']] = $plan;
}

// Get local cache
$table_plans = $wpdb->prefix . 'onefunders_plans';
$local_plans = $wpdb->get_results("SELECT * FROM $table_plans", ARRAY_A);
$local_plans_by_type = array();
foreach ($local_plans as $plan) {
    $local_plans_by_type[$plan['account_type']] = $plan;
}
?>

<div class="wrap">
    <h1>Plans</h1>
    
    <?php if (isset($success)): ?>
        <div class="notice notice-success"><p><?php echo esc_html($success); ?></p></div>
    <?php endif; ?>
    
    <?php if (isset($error)): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>
    
    <?php if (empty($account_types)): ?>
        <div class="notice notice-warning">
            <p><strong>No account types found in WooCommerce orders.</strong></p>
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
                    echo esc_html($meta->key . ' = ' . $meta->value) . "\n";
                }
                ?></pre>
            <?php endif; ?>
        </div>
    <?php else: ?>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th>Account Type</th>
                    <th>Backend ID</th>
                    <th>Daily DD %</th>
                    <th>Max DD %</th>
                    <th>Daily Floating</th>
                    <th>Max Floating</th>
                    <th>Synced At</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($account_types as $account_type): ?>
                    <?php
                    $local_plan = $local_plans_by_type[$account_type] ?? null;
                    $backend_plan = $backend_plans_by_name[$account_type] ?? null;
                    ?>
                    <tr>
                        <td><strong><?php echo esc_html($account_type); ?></strong></td>
                        <td>
                            <?php 
                            if ($backend_plan) {
                                echo esc_html($backend_plan['id']);
                            } elseif ($local_plan && $local_plan['backend_plan_id']) {
                                echo esc_html($local_plan['backend_plan_id']);
                            } else {
                                echo '—';
                            }
                            ?>
                        </td>
                        <td>
                            <input type="number" 
                                   step="0.01" 
                                   name="daily_dd_percent_<?php echo esc_attr($account_type); ?>" 
                                   value="<?php echo esc_attr($local_plan['daily_dd_percent'] ?? $backend_plan['daily_dd_percent'] ?? ''); ?>" 
                                   class="small-text" />
                        </td>
                        <td>
                            <input type="number" 
                                   step="0.01" 
                                   name="max_dd_percent_<?php echo esc_attr($account_type); ?>" 
                                   value="<?php echo esc_attr($local_plan['max_dd_percent'] ?? $backend_plan['max_dd_percent'] ?? ''); ?>" 
                                   class="small-text" />
                        </td>
                        <td>
                            <input type="checkbox" 
                                   name="daily_dd_is_floating_<?php echo esc_attr($account_type); ?>" 
                                   <?php checked($local_plan['daily_dd_is_floating'] ?? $backend_plan['daily_dd_is_floating'] ?? false); ?> />
                        </td>
                        <td>
                            <input type="checkbox" 
                                   name="max_dd_is_floating_<?php echo esc_attr($account_type); ?>" 
                                   <?php checked($local_plan['max_dd_is_floating'] ?? $backend_plan['max_dd_is_floating'] ?? false); ?> />
                        </td>
                        <td>
                            <?php 
                            if ($local_plan && $local_plan['synced_at']) {
                                echo esc_html($local_plan['synced_at']);
                            } else {
                                echo 'Never';
                            }
                            ?>
                        </td>
                        <td>
                            <form method="post" action="" style="display:inline;">
                                <?php wp_nonce_field('onefunders_plans_sync'); ?>
                                <input type="hidden" name="action" value="sync_plan" />
                                <input type="hidden" name="account_type" value="<?php echo esc_attr($account_type); ?>" />
                                <input type="hidden" name="daily_dd_percent" value="" class="daily_dd_percent_input" />
                                <input type="hidden" name="max_dd_percent" value="" class="max_dd_percent_input" />
                                <input type="hidden" name="daily_dd_is_floating" value="0" />
                                <input type="hidden" name="max_dd_is_floating" value="0" />
                                <button type="submit" class="button button-primary sync-plan-btn" data-account-type="<?php echo esc_attr($account_type); ?>">Sync</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        
        <script>
        jQuery(document).ready(function($) {
            $('.sync-plan-btn').on('click', function(e) {
                var accountType = $(this).data('account-type');
                var form = $(this).closest('form');
                
                // Get values from inputs
                var dailyDdPercent = $('input[name="daily_dd_percent_' + accountType + '"]').val();
                var maxDdPercent = $('input[name="max_dd_percent_' + accountType + '"]').val();
                var dailyDdIsFloating = $('input[name="daily_dd_is_floating_' + accountType + '"]').is(':checked');
                var maxDdIsFloating = $('input[name="max_dd_is_floating_' + accountType + '"]').is(':checked');
                
                // Set hidden inputs
                form.find('.daily_dd_percent_input').val(dailyDdPercent);
                form.find('.max_dd_percent_input').val(maxDdPercent);
                form.find('input[name="daily_dd_is_floating"]').val(dailyDdIsFloating ? '1' : '0');
                form.find('input[name="max_dd_is_floating"]').val(maxDdIsFloating ? '1' : '0');
            });
        });
        </script>
    <?php endif; ?>
</div>

