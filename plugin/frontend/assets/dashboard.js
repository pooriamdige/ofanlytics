(function($) {
    'use strict';
    
    const apiUrl = onefundersAnalytics.apiUrl;
    const wpUserId = onefundersAnalytics.wpUserId;
    let currentAccountId = null;
    
    function loadAccountData(accountId) {
        currentAccountId = accountId;
        
        // Load analytics
        $.ajax({
            url: apiUrl + '/api/accounts/' + accountId + '/analytics?wp_user_id=' + wpUserId,
            method: 'GET',
            success: function(data) {
                if (data.error) {
                    showError(data.error.message);
                    return;
                }
                renderMetrics(data.metrics, data.monitoring_state, data.daily_reset);
            },
            error: function() {
                showError('Failed to load analytics');
            }
        });
        
        // Load orders
        loadOrders(accountId, 1);
    }
    
    function renderMetrics(metrics, monitoringState, dailyReset) {
        const grid = $('#onefunders-metrics-grid');
        grid.html(`
            <div class="metric-card">
                <div class="metric-label">Balance</div>
                <div class="metric-value">$${formatNumber(metrics.current_balance)}</div>
                <div class="metric-note">Display only</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Current Equity</div>
                <div class="metric-value">$${formatNumber(metrics.current_equity)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Max DD Usage</div>
                <div class="metric-value">${metrics.max_usage_percent_of_limit.toFixed(2)}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(metrics.max_usage_percent_of_limit, 100)}%"></div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Daily DD Usage</div>
                <div class="metric-value">${metrics.daily_usage_percent_of_limit.toFixed(2)}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(metrics.daily_usage_percent_of_limit, 100)}%"></div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Reset Countdown</div>
                <div class="metric-value" id="reset-countdown">${formatTime(dailyReset.seconds_until_reset)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Monitoring State</div>
                <div class="metric-value">${monitoringState === 'live' ? 'Live Monitoring' : 'Normal'}</div>
            </div>
        `);
        
        // Update connection status
        updateConnectionStatus(monitoringState);
        
        // Start countdown timer
        startCountdown(dailyReset.seconds_until_reset);
        
        // Render trading stats
        renderTradingStats(metrics);
    }
    
    function renderTradingStats(metrics) {
        const stats = $('#onefunders-trading-stats');
        stats.html(`
            <h3>Trading Statistics</h3>
            <table class="trading-stats-table">
                <tr><td>Win Rate</td><td>${metrics.win_rate.toFixed(2)}%</td></tr>
                <tr><td>Loss Rate</td><td>${metrics.loss_rate.toFixed(2)}%</td></tr>
                <tr><td>Profit Factor</td><td>${metrics.profit_factor ? metrics.profit_factor.toFixed(2) : 'N/A'}</td></tr>
                <tr><td>Best Trade</td><td>$${formatNumber(metrics.best_trade)}</td></tr>
                <tr><td>Worst Trade</td><td>$${formatNumber(metrics.worst_trade)}</td></tr>
                <tr><td>Gross Profit</td><td>$${formatNumber(metrics.gross_profit)}</td></tr>
                <tr><td>Gross Loss</td><td>$${formatNumber(metrics.gross_loss)}</td></tr>
                <tr><td>Trading Days</td><td>${metrics.trading_days}</td></tr>
                <tr><td>Total Lots</td><td>${formatNumber(metrics.total_lots)}</td></tr>
                <tr><td>Trades Count</td><td>${metrics.trades_count}</td></tr>
            </table>
        `);
    }
    
    function loadOrders(accountId, page) {
        $.ajax({
            url: apiUrl + '/api/accounts/' + accountId + '/orders?wp_user_id=' + wpUserId + '&page=' + page + '&per_page=50',
            method: 'GET',
            success: function(data) {
                if (data.error) {
                    showError(data.error.message);
                    return;
                }
                renderOrders(data.orders || [], data.pagination || {});
            },
            error: function() {
                showError('Failed to load orders');
            }
        });
    }
    
    function renderOrders(orders, pagination) {
        const history = $('#onefunders-order-history');
        
        let html = '<h3>Order History</h3>';
        html += '<button class="export-btn" onclick="exportOrders()">Download XLSX</button>';
        html += '<table class="orders-table"><thead><tr><th>Order ID</th><th>Symbol</th><th>Type</th><th>Volume</th><th>Price Open</th><th>Price Close</th><th>Profit</th><th>Time Open</th><th>Time Close</th></tr></thead><tbody>';
        
        if (orders.length === 0) {
            html += '<tr><td colspan="9">No orders found</td></tr>';
        } else {
            orders.forEach(function(order) {
                html += `<tr>
                    <td>${order.order_id}</td>
                    <td>${order.symbol || ''}</td>
                    <td>${order.type || ''}</td>
                    <td>${formatNumber(order.volume || 0)}</td>
                    <td>${formatNumber(order.price_open || 0)}</td>
                    <td>${formatNumber(order.price_close || 0)}</td>
                    <td>$${formatNumber(order.profit || 0)}</td>
                    <td>${formatDate(order.time_open)}</td>
                    <td>${order.time_close ? formatDate(order.time_close) : ''}</td>
                </tr>`;
            });
        }
        
        html += '</tbody></table>';
        
        if (pagination.total_pages > 1) {
            html += '<div class="pagination">';
            for (let i = 1; i <= pagination.total_pages; i++) {
                html += `<button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="loadOrdersPage(${i})">${i}</button>`;
            }
            html += '</div>';
        }
        
        history.html(html);
    }
    
    function updateConnectionStatus(monitoringState) {
        const status = $('#onefunders-connection-status');
        const dot = status.find('.status-dot');
        const text = status.find('.status-text');
        
        if (monitoringState === 'live') {
            dot.addClass('live');
            text.text('Live Monitoring');
        } else {
            dot.removeClass('live');
            text.text('Normal');
        }
    }
    
    function startCountdown(seconds) {
        let remaining = seconds;
        const countdownEl = $('#reset-countdown');
        
        const interval = setInterval(function() {
            countdownEl.text(formatTime(remaining));
            remaining--;
            if (remaining < 0) {
                clearInterval(interval);
                location.reload();
            }
        }, 1000);
    }
    
    function formatNumber(num) {
        return parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleString();
    }
    
    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${minutes}m ${secs}s`;
    }
    
    function showError(message) {
        alert('Error: ' + message);
    }
    
    window.loadOrdersPage = function(page) {
        if (currentAccountId) {
            loadOrders(currentAccountId, page);
        }
    };
    
    window.exportOrders = function() {
        if (currentAccountId) {
            const exportUrl = apiUrl + '/api/accounts/' + currentAccountId + '/orders/export?format=xlsx&wp_user_id=' + wpUserId;
            window.open(exportUrl, '_blank');
        }
    };
    
    // Initialize
    $(document).ready(function() {
        const selector = $('#onefunders-account-selector');
        if (selector.length) {
            const firstAccountId = selector.val();
            loadAccountData(firstAccountId);
            
            selector.on('change', function() {
                loadAccountData($(this).val());
            });
        } else {
            // Single account
            const accountId = $('.onefunders-dashboard').data('account-id');
            if (accountId) {
                loadAccountData(accountId);
            }
        }
    });
    
})(jQuery);

