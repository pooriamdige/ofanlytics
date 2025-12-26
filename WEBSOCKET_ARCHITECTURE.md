# WebSocket Architecture - Multi-Account Support

## Overview

The WebSocket manager has been optimized to use a **single shared WebSocket connection** that can handle multiple account subscriptions simultaneously. This is more efficient and scalable than creating one connection per account.

## Architecture

### Shared Connection Model

- **One WebSocket connection** to `http://185.8.173.37:5000`
- **Multiple account subscriptions** on the same connection
- **Event routing** based on `session_id`, `login`/`server`, or `account_id` in events

### How It Works

1. **Connection**: A single WebSocket connection is established to the Events service
2. **Subscription**: Each account subscribes by sending a message with:
   ```json
   {
     "action": "subscribe",
     "login": "12345678",
     "server": "Broker-Demo",
     "session_id": "373386c4-c7ba-4fd5-a4f2-d62108617c2d"
   }
   ```
3. **Event Routing**: When events arrive, they are routed to the correct account handler based on:
   - `session_id` in the event (most reliable)
   - `login` and `server` in the event
   - `account_id` in the event (if provided by Events service)

### Benefits

- **Efficiency**: One connection instead of N connections (where N = number of accounts in live monitoring)
- **Scalability**: Can handle hundreds of accounts on a single connection
- **Resource Usage**: Lower memory and network overhead
- **Reconnection**: Single reconnection handles all accounts

## Implementation Details

### WebSocketManager Class

```typescript
// Single shared connection
private sharedWsClient: MTAPIWebSocketClient | null = null;

// Track all account subscriptions
private subscriptions: Map<number, AccountSubscription> = new Map();
```

### Subscription Flow

1. Account enters live monitoring (97% DD usage threshold)
2. `WebSocketManager.subscribe()` is called with account details
3. If no shared connection exists, create one
4. Send subscribe message to Events service
5. Store subscription info for event routing

### Event Routing

Events from the Events service are routed to the correct account handler using:

1. **Primary**: `session_id` matching (most reliable)
2. **Secondary**: `login` + `server` matching
3. **Tertiary**: `account_id` in event (if provided)
4. **Fallback**: Emit to all handlers if routing fails

### Reconnection Handling

- If the shared connection disconnects:
  - All subscriptions are automatically resubscribed after reconnection
  - Exponential backoff retry logic
  - Accounts remain in `monitoring_state='live'` during reconnection

## Example Flow

### Scenario: 3 Accounts in Live Monitoring

1. **Account 1** (session_id: `abc-123`) enters live monitoring
   - Shared WebSocket connection created
   - Subscribe message sent: `{action: "subscribe", login: "111", server: "Demo", session_id: "abc-123"}`

2. **Account 2** (session_id: `def-456`) enters live monitoring
   - Uses existing shared connection
   - Subscribe message sent: `{action: "subscribe", login: "222", server: "Demo", session_id: "def-456"}`

3. **Account 3** (session_id: `ghi-789`) enters live monitoring
   - Uses existing shared connection
   - Subscribe message sent: `{action: "subscribe", login: "333", server: "Demo", session_id: "ghi-789"}`

4. **Event arrives** for Account 2:
   - Event contains `session_id: "def-456"` or `login: "222", server: "Demo"`
   - Routed to Account 2's handler
   - DD metrics recomputed
   - Violation check performed

5. **Account 2 exits** live monitoring (DD usage < 90%):
   - Unsubscribe message sent
   - Account removed from subscriptions map
   - If no more subscriptions, connection is closed

## Testing

To verify the implementation works correctly:

1. **Test with multiple accounts:**
   ```sql
   -- Set multiple accounts to live monitoring
   UPDATE accounts SET monitoring_state = 'live' WHERE id IN (1, 2, 3);
   ```

2. **Check WebSocket connection:**
   - Should see: "Shared WebSocket connected"
   - Should see: "Subscribed account X to shared WebSocket" for each account

3. **Monitor events:**
   - Events should be routed to correct accounts
   - Check logs for "orderProfit" or "equityUpdate" events with correct accountId

4. **Test reconnection:**
   - Disconnect network briefly
   - Should see: "Shared WebSocket disconnected"
   - Should see: "Resubscribing X accounts after reconnection..."

## Troubleshooting

### Events not routing correctly

- Check that Events service includes `session_id`, `login`, or `account_id` in events
- Verify subscription messages are being sent correctly
- Check logs for routing warnings

### Connection issues

- Verify `MTAPI_EVENTS_URL` is correct in `.env`
- Check firewall allows WebSocket connections
- Test connection manually: `wscat -c ws://185.8.173.37:5000`

### Multiple connections created

- This shouldn't happen with the new implementation
- If it does, check for race conditions in `getSharedConnection()`

## Migration Notes

The previous implementation created one WebSocket per account. The new implementation:
- ✅ Uses a single shared connection
- ✅ Automatically handles reconnection and resubscription
- ✅ Routes events correctly to account handlers
- ✅ More efficient and scalable

No changes needed to:
- Poll worker (it still calls `wsManager.subscribe()`)
- Live monitor worker (it still receives events via `wsManager.on()`)
- Database schema (no changes needed)

