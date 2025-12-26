<?php
if (!defined('ABSPATH')) {
    exit;
}

$api_client = new OneFunders_Analytics_API_Client();

// Handle form submissions
if (isset($_POST['action'])) {
    check_admin_referer('onefunders_plans');
    
    if ($_POST['action'] === 'create') {
        $result = $api_client->create_plan(array(
            'name' => sanitize_text_field($_POST['name']),
            'daily_dd_percent' => floatval($_POST['daily_dd_percent']),
            'max_dd_percent' => floatval($_POST['max_dd_percent']),
            'daily_dd_is_floating' => isset($_POST['daily_dd_is_floating']),
            'max_dd_is_floating' => isset($_POST['max_dd_is_floating']),
        ));
        
        if (isset($result['error'])) {
            $error = $result['error']['message'];
        } else {
            $success = 'Plan created successfully';
        }
    } elseif ($_POST['action'] === 'update') {
        $result = $api_client->update_plan(intval($_POST['plan_id']), array(
            'name' => sanitize_text_field($_POST['name']),
            'daily_dd_percent' => floatval($_POST['daily_dd_percent']),
            'max_dd_percent' => floatval($_POST['max_dd_percent']),
            'daily_dd_is_floating' => isset($_POST['daily_dd_is_floating']),
            'max_dd_is_floating' => isset($_POST['max_dd_is_floating']),
        ));
        
        if (isset($result['error'])) {
            $error = $result['error']['message'];
        } else {
            $success = 'Plan updated successfully';
        }
    } elseif ($_POST['action'] === 'delete') {
        $result = $api_client->delete_plan(intval($_POST['plan_id']));
        
        if (isset($result['error'])) {
            $error = $result['error']['message'];
        } else {
            $success = 'Plan deleted successfully';
        }
    }
}

$plans_result = $api_client->get_plans();
$plans = isset($plans_result['plans']) ? $plans_result['plans'] : array();
?>

<div class="wrap">
    <h1>Plans</h1>
    
    <?php if (isset($success)): ?>
        <div class="notice notice-success"><p><?php echo esc_html($success); ?></p></div>
    <?php endif; ?>
    
    <?php if (isset($error)): ?>
        <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>
    
    <h2>Create New Plan</h2>
    <form method="post" action="">
        <?php wp_nonce_field('onefunders_plans'); ?>
        <input type="hidden" name="action" value="create" />
        <table class="form-table">
            <tr>
                <th><label for="name">Plan Name</label></th>
                <td><input type="text" id="name" name="name" required class="regular-text" /></td>
            </tr>
            <tr>
                <th><label for="daily_dd_percent">Daily DD %</label></th>
                <td><input type="number" id="daily_dd_percent" name="daily_dd_percent" step="0.01" required class="small-text" /></td>
            </tr>
            <tr>
                <th><label for="max_dd_percent">Max DD %</label></th>
                <td><input type="number" id="max_dd_percent" name="max_dd_percent" step="0.01" required class="small-text" /></td>
            </tr>
            <tr>
                <th><label for="daily_dd_is_floating">Daily DD Floating</label></th>
                <td><input type="checkbox" id="daily_dd_is_floating" name="daily_dd_is_floating" /></td>
            </tr>
            <tr>
                <th><label for="max_dd_is_floating">Max DD Floating</label></th>
                <td><input type="checkbox" id="max_dd_is_floating" name="max_dd_is_floating" /></td>
            </tr>
        </table>
        <?php submit_button('Create Plan'); ?>
    </form>
    
    <h2>Existing Plans</h2>
    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Daily DD %</th>
                <th>Max DD %</th>
                <th>Daily Floating</th>
                <th>Max Floating</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($plans as $plan): ?>
                <tr>
                    <td><?php echo esc_html($plan['id']); ?></td>
                    <td><?php echo esc_html($plan['name']); ?></td>
                    <td><?php echo esc_html($plan['daily_dd_percent']); ?>%</td>
                    <td><?php echo esc_html($plan['max_dd_percent']); ?>%</td>
                    <td><?php echo $plan['daily_dd_is_floating'] ? 'Yes' : 'No'; ?></td>
                    <td><?php echo $plan['max_dd_is_floating'] ? 'Yes' : 'No'; ?></td>
                    <td>
                        <form method="post" style="display:inline;">
                            <?php wp_nonce_field('onefunders_plans'); ?>
                            <input type="hidden" name="action" value="delete" />
                            <input type="hidden" name="plan_id" value="<?php echo esc_attr($plan['id']); ?>" />
                            <button type="submit" class="button button-small" onclick="return confirm('Are you sure?');">Delete</button>
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

