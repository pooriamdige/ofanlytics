<?php
/**
 * Database class for custom tables
 */

if (!defined('ABSPATH')) {
    exit;
}

class OneFunders_Analytics_Database {
    
    public function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Accounts table
        $table_accounts = $wpdb->prefix . 'onefunders_accounts';
        $sql_accounts = "CREATE TABLE IF NOT EXISTS $table_accounts (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            wp_user_id bigint(20) NOT NULL,
            login varchar(50) NOT NULL,
            server varchar(100) NOT NULL,
            plan_id bigint(20) DEFAULT NULL,
            is_failed tinyint(1) DEFAULT 0,
            failure_reason text DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_synced_at datetime DEFAULT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY login_server (login, server),
            KEY wp_user_id (wp_user_id),
            KEY plan_id (plan_id)
        ) $charset_collate;";
        
        // Plans table (cache from backend)
        $table_plans = $wpdb->prefix . 'onefunders_plans';
        $sql_plans = "CREATE TABLE IF NOT EXISTS $table_plans (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            backend_plan_id bigint(20) NOT NULL,
            name varchar(255) NOT NULL,
            daily_dd_percent decimal(5,2) NOT NULL,
            max_dd_percent decimal(5,2) NOT NULL,
            daily_dd_is_floating tinyint(1) DEFAULT 0,
            max_dd_is_floating tinyint(1) DEFAULT 0,
            synced_at datetime DEFAULT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY backend_plan_id (backend_plan_id)
        ) $charset_collate;";
        
        // Account type mapping table
        $table_mapping = $wpdb->prefix . 'onefunders_account_type_mapping';
        $sql_mapping = "CREATE TABLE IF NOT EXISTS $table_mapping (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            account_type varchar(255) NOT NULL,
            backend_plan_id bigint(20) NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY account_type (account_type)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql_accounts);
        dbDelta($sql_plans);
        dbDelta($sql_mapping);
    }
}

