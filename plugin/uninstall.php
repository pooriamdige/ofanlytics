<?php
/**
 * Uninstall script
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;

// Drop custom tables
$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}onefunders_accounts");
$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}onefunders_plans");
$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}onefunders_account_type_mapping");

// Delete options
delete_option('onefunders_analytics_api_url');

