<?php
/**
 * API Client for backend service
 */

if (!defined('ABSPATH')) {
    exit;
}

class OneFunders_Analytics_API_Client {
    
    private $api_url;
    
    public function __construct() {
        $this->api_url = get_option('onefunders_analytics_api_url', 'http://localhost:3000');
    }
    
    private function request($method, $endpoint, $data = null) {
        $url = rtrim($this->api_url, '/') . '/' . ltrim($endpoint, '/');
        
        $args = array(
            'method' => $method,
            'timeout' => 120, // 120 seconds - MT5 API connection can be slow
            'headers' => array(
                'Content-Type' => 'application/json',
            ),
        );
        
        if ($data) {
            $args['body'] = json_encode($data);
        }
        
        $response = wp_remote_request($url, $args);
        
        if (is_wp_error($response)) {
            return array(
                'error' => array(
                    'code' => 'REQUEST_ERROR',
                    'message' => $response->get_error_message(),
                ),
            );
        }
        
        $body = wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);
        
        if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
            // Log the actual response for debugging
            error_log('OneFunders API: Invalid JSON response. Status: ' . $status_code . ', Body: ' . substr($body, 0, 500));
            return array(
                'error' => array(
                    'code' => 'INVALID_RESPONSE',
                    'message' => 'Invalid JSON response: ' . json_last_error_msg() . ' (Status: ' . $status_code . ')',
                    'raw_response' => substr($body, 0, 500), // First 500 chars for debugging
                ),
            );
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code >= 400) {
            return $decoded;
        }
        
        return $decoded;
    }
    
    public function get_plans() {
        return $this->request('GET', '/api/plans');
    }
    
    public function sync_plan($data) {
        return $this->request('POST', '/api/plans/sync', $data);
    }
    
    public function connect_account($data) {
        return $this->request('POST', '/api/accounts/connect', $data);
    }
    
    public function get_analytics($hash) {
        return $this->request('GET', '/api/analytics/' . $hash);
    }
    
    public function get_orders($account_id, $wp_user_id, $page = 1, $per_page = 50, $from = null, $to = null) {
        $url = '/api/accounts/' . $account_id . '/orders?wp_user_id=' . $wp_user_id . '&page=' . $page . '&per_page=' . $per_page;
        if ($from) {
            $url .= '&from=' . urlencode($from);
        }
        if ($to) {
            $url .= '&to=' . urlencode($to);
        }
        return $this->request('GET', $url);
    }
    
    public function export_orders($account_id, $wp_user_id, $from = null, $to = null) {
        $url = '/api/accounts/' . $account_id . '/orders/export?format=xlsx&wp_user_id=' . $wp_user_id;
        if ($from) {
            $url .= '&from=' . urlencode($from);
        }
        if ($to) {
            $url .= '&to=' . urlencode($to);
        }
        
        $full_url = rtrim($this->api_url, '/') . '/' . ltrim($url, '/');
        return $full_url;
    }
    
    /**
     * Check backend connectivity
     */
    public function check_connectivity() {
        $url = rtrim($this->api_url, '/') . '/health';
        
        $response = wp_remote_get($url, array(
            'timeout' => 10,
        ));
        
        if (is_wp_error($response)) {
            return array(
                'success' => false,
                'message' => $response->get_error_message(),
            );
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);
        
        if ($status_code === 200 && isset($decoded['status']) && $decoded['status'] === 'ok') {
            return array(
                'success' => true,
                'message' => 'Connected successfully',
                'database' => $decoded['database'] ?? 'unknown',
            );
        }
        
        return array(
            'success' => false,
            'message' => 'Backend returned status code: ' . $status_code,
        );
    }
}

