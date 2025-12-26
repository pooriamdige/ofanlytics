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
            'timeout' => 30,
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
        
        if ($decoded === null) {
            return array(
                'error' => array(
                    'code' => 'INVALID_RESPONSE',
                    'message' => 'Invalid JSON response',
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
    
    public function create_plan($data) {
        return $this->request('POST', '/api/plans', $data);
    }
    
    public function update_plan($id, $data) {
        return $this->request('PUT', '/api/plans/' . $id, $data);
    }
    
    public function delete_plan($id) {
        return $this->request('DELETE', '/api/plans/' . $id);
    }
    
    public function get_accounts($wp_user_id) {
        return $this->request('GET', '/api/accounts?wp_user_id=' . $wp_user_id);
    }
    
    public function create_account($data) {
        return $this->request('POST', '/api/accounts', $data);
    }
    
    public function update_account($id, $data) {
        return $this->request('PUT', '/api/accounts/' . $id, $data);
    }
    
    public function get_analytics($account_id, $wp_user_id) {
        return $this->request('GET', '/api/accounts/' . $account_id . '/analytics?wp_user_id=' . $wp_user_id);
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
}

