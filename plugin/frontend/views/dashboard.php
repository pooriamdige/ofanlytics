<?php
if (!defined('ABSPATH')) {
    exit;
}

$api_client = new OneFunders_Analytics_API_Client();
$wp_user_id = get_current_user_id();

$accounts_result = $api_client->get_accounts($wp_user_id);
$accounts = isset($accounts_result['accounts']) ? $accounts_result['accounts'] : array();
?>

<div id="onefunders-analytics-dashboard" class="onefunders-dashboard">
    <?php if (empty($accounts)): ?>
        <div class="onefunders-no-accounts">
            <p>No accounts found. Please contact support to link your trading account.</p>
        </div>
    <?php else: ?>
        <div class="onefunders-dashboard-header">
            <?php if (count($accounts) > 1): ?>
                <select id="onefunders-account-selector" class="onefunders-account-selector">
                    <?php foreach ($accounts as $account): ?>
                        <option value="<?php echo esc_attr($account['id']); ?>">
                            <?php echo esc_html($account['login'] . ' - ' . $account['server']); ?>
                            <?php if ($account['is_failed']): ?>
                                (Failed)
                            <?php endif; ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            <?php endif; ?>
            <div class="onefunders-connection-status" id="onefunders-connection-status">
                <span class="status-dot"></span>
                <span class="status-text">Loading...</span>
            </div>
        </div>
        
        <div class="onefunders-metrics-grid" id="onefunders-metrics-grid">
            <!-- Metrics will be loaded via JavaScript -->
            <div class="loading">Loading metrics...</div>
        </div>
        
        <div class="onefunders-trading-stats" id="onefunders-trading-stats">
            <!-- Trading stats will be loaded via JavaScript -->
        </div>
        
        <div class="onefunders-order-history" id="onefunders-order-history">
            <!-- Order history will be loaded via JavaScript -->
        </div>
    <?php endif; ?>
</div>

