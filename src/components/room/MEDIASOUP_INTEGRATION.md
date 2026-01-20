# Mediasoup Integration Guide

## Overview

The `room.mediasoup.ts` file implements a complete Mediasoup SFU (Selective Forwarding Unit) integration for the Shared Study Rooms feature. This integration supports real-time video and audio streaming for up to 50 concurrent participants per room across 10 rooms.

## Installation

### 1. Install Mediasoup Package

```bash
npm install mediasoup@3
```

### 2. Install Type Definitions

```bash
npm install --save-dev @types/mediasoup
```

Note: Mediasoup has native dependencies and requires build tools:
- **Linux**: `build-essential`, `python3`
- **macOS**: Xcode Command Line Tools
- **Windows**: Visual Studio Build Tools

## Architecture

### Worker Pool Management

The service initializes one Mediasoup worker per CPU core for optimal load distribution:

```typescript
const mediasoupService = MediasoupService.getInstance();
await mediasoupService.initialize();
```

Workers are distributed using round-robin strategy when creating routers.

### Router Per Room

Each room gets its own Mediasoup router for media routing:

```typescript
const router = await mediasoupService.createRouter(roomId);
```

Routers are created on-demand and cached for the lifetime of the room.

### Transport Management

Each participant needs two transports:
- **Send Transport**: For producing media (sending audio/video)
- **Receive Transport**: For consuming media (receiving audio/video from others)

```typescript
// Create send transport
const sendTransport = await mediasoupService.createTransport(
    roomId,
    participantId,
    'send'
);

// Create receive transport
const recvTransport = await mediasoupService.createTransport(
    roomId,
    participantId,
    'recv'
);
```

### Producer/Consumer Flow

1. **Participant produces media**:
   ```typescript
   const producerId = await mediasoupService.createProducer(
       roomId,
       participantId,
       transportId,
       'video', // or 'audio'
       rtpParameters
   );
   ```

2. **Other participants consume the media**:
   ```typescript
   const consumer = await mediasoupService.createConsumer(
       roomId,
       consumerParticipantId,
       recvTransportId,
       producerId,
       rtpCapabilities
   );
   ```

3. **Resume consumer to start receiving**:
   ```typescript
   await mediasoupService.resumeConsumer(
       roomId,
       participantId,
       consumerId
   );
   ```

## Configuration

### Environment Variables

Add to `.env`:

```env
# Mediasoup Configuration
MEDIASOUP_ANNOUNCED_IP=your.server.ip.address
MEDIASOUP_RTC_MIN_PORT=10000
MEDIASOUP_RTC_MAX_PORT=10100
```

For local development, use `127.0.0.1`. For production, use your server's public IP.

### Firewall Configuration

Open UDP ports for WebRTC:
```bash
# Allow UDP ports 10000-10100
sudo ufw allow 10000:10100/udp
```

### Media Codecs

The integration supports:
- **Audio**: Opus codec (48kHz, stereo)
- **Video**: VP8 codec (90kHz)

These codecs are widely supported by modern browsers.

## Integration with Socket.io

The Mediasoup service works alongside Socket.io for signaling:

1. **Client requests RTP capabilities**:
   ```typescript
   socket.on('get-rtp-capabilities', async () => {
       const rtpCapabilities = await mediasoupService.getRtpCapabilities(roomId);
       socket.emit('rtp-capabilities', rtpCapabilities);
   });
   ```

2. **Client creates transport**:
   ```typescript
   socket.on('create-transport', async ({ direction }) => {
       const transport = await mediasoupService.createTransport(
           roomId,
           userId,
           direction
       );
       socket.emit('transport-created', transport);
   });
   ```

3. **Client connects transport**:
   ```typescript
   socket.on('connect-transport', async ({ transportId, dtlsParameters }) => {
       await mediasoupService.connectTransport(
           roomId,
           userId,
           transportId,
           dtlsParameters
       );
       socket.emit('transport-connected');
   });
   ```

4. **Client produces media**:
   ```typescript
   socket.on('produce', async ({ transportId, kind, rtpParameters }) => {
       const producerId = await mediasoupService.createProducer(
           roomId,
           userId,
           transportId,
           kind,
           rtpParameters
       );
       
       // Notify other participants
       socket.broadcast.to(roomId).emit('new-producer', {
           producerId,
           participantId: userId,
           kind
       });
       
       socket.emit('produced', { producerId });
   });
   ```

5. **Client consumes media**:
   ```typescript
   socket.on('consume', async ({ transportId, producerId, rtpCapabilities }) => {
       const consumer = await mediasoupService.createConsumer(
           roomId,
           userId,
           transportId,
           producerId,
           rtpCapabilities
       );
       socket.emit('consumed', consumer);
   });
   ```

## Cleanup

### Participant Cleanup

When a participant leaves or disconnects:

```typescript
await mediasoupService.cleanupParticipant(roomId, participantId);
```

This closes all transports, producers, and consumers for that participant.

### Room Cleanup

When a room is closed:

```typescript
await mediasoupService.cleanupRoom(roomId);
```

This closes the router and all associated resources.

### Service Shutdown

On application shutdown:

```typescript
await mediasoupService.shutdown();
```

This closes all workers and cleans up all resources.

## Performance Considerations

### Capacity

The integration is designed for:
- **10 rooms** simultaneously
- **50 participants per room**
- **Up to 100 video streams** per room (2 per participant: camera + screen share)

### Resource Usage

- **CPU**: One worker per core, ~5-10% CPU per active video stream
- **Memory**: ~50MB per worker, ~1MB per transport
- **Bandwidth**: ~1-2 Mbps per video stream (VP8 at 720p)

### Optimization Tips

1. **Recommend audio-only mode** when occupancy > 40:
   ```typescript
   const occupancy = await roomService.getParticipantCount(roomId);
   if (occupancy > 40) {
       socket.emit('recommend-audio-only');
   }
   ```

2. **Use simulcast** for better quality adaptation:
   ```typescript
   // Enable in producer creation
   const producer = await transport.produce({
       kind: 'video',
       rtpParameters,
       encodings: [
           { maxBitrate: 100000 },
           { maxBitrate: 300000 },
           { maxBitrate: 900000 },
       ],
   });
   ```

3. **Monitor worker load**:
   ```typescript
   const stats = await mediasoupService.getWorkerStats();
   console.log('Worker stats:', stats);
   ```

## Monitoring

### Room Statistics

```typescript
const stats = mediasoupService.getRoomStats(roomId);
console.log(`Room ${roomId}:`, {
    participants: stats.participantCount,
    transports: stats.transportCount,
    producers: stats.producerCount,
    consumers: stats.consumerCount,
});
```

### Worker Statistics

```typescript
const workerStats = await mediasoupService.getWorkerStats();
workerStats.forEach((stat, index) => {
    console.log(`Worker ${index + 1} (PID ${stat.pid}): ${stat.routerCount} routers`);
});
```

## Error Handling

The service includes comprehensive error handling:

- **Worker death**: Automatically exits the process (should be restarted by process manager)
- **Transport close**: Automatically cleans up associated producers/consumers
- **Producer close**: Automatically notifies consumers
- **Consumer close**: Automatically cleans up resources

All errors are logged with context using Winston logger.

## Testing

### Unit Tests

Test individual methods:

```typescript
describe('MediasoupService', () => {
    it('should initialize workers', async () => {
        await mediasoupService.initialize();
        expect(mediasoupService.isInitialized()).toBe(true);
    });

    it('should create router for room', async () => {
        const router = await mediasoupService.createRouter('room-1');
        expect(router).toBeDefined();
    });
});
```

### Integration Tests

Test complete flow with Socket.io:

```typescript
describe('Mediasoup Integration', () => {
    it('should handle complete producer-consumer flow', async () => {
        // 1. Create transports
        // 2. Connect transports
        // 3. Create producer
        // 4. Create consumer
        // 5. Resume consumer
        // 6. Verify media flow
    });
});
```

## Troubleshooting

### Common Issues

1. **Worker fails to start**:
   - Check build tools are installed
   - Verify ports 10000-10100 are available
   - Check firewall settings

2. **Transport connection fails**:
   - Verify `MEDIASOUP_ANNOUNCED_IP` is correct
   - Check NAT/firewall configuration
   - Ensure UDP ports are open

3. **No media received**:
   - Verify consumer is resumed
   - Check RTP capabilities match
   - Verify producer is active

4. **High CPU usage**:
   - Reduce video resolution/bitrate
   - Enable simulcast
   - Recommend audio-only mode

### Debug Logging

Enable debug logging:

```typescript
// In mediasoupConfig
worker: {
    logLevel: 'debug',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp', 'rtx', 'bwe', 'score', 'simulcast', 'svc', 'sctp'],
}
```

## Production Deployment

### TURN Server

For production, configure a TURN server for NAT traversal:

```typescript
// Client-side configuration
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    {
        urls: 'turn:your-turn-server.com:3478',
        username: 'username',
        credential: 'password',
    },
];
```

### Load Balancing

For horizontal scaling:

1. Use Redis for Socket.io adapter
2. Implement sticky sessions based on room ID
3. Monitor worker load and distribute rooms accordingly

### Security

1. **Enable DTLS-SRTP** (enabled by default)
2. **Validate RTP parameters** before creating producers
3. **Rate limit** transport/producer creation
4. **Monitor bandwidth** usage per participant

## References

- [Mediasoup Documentation](https://mediasoup.org/documentation/v3/)
- [WebRTC Basics](https://webrtc.org/getting-started/overview)
- [SFU Architecture](https://webrtcglossary.com/sfu/)
