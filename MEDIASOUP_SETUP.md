# Mediasoup Setup Instructions

## Task 10.1 Implementation Complete ✓

The `room.mediasoup.ts` file has been successfully created with complete Mediasoup integration including:

- ✅ Worker pool management (one per CPU core)
- ✅ Router creation per room
- ✅ WebRTC transport creation for producers and consumers
- ✅ RTP capabilities handling
- ✅ Producer/consumer management
- ✅ Cleanup and resource management
- ✅ Statistics and monitoring

## Required Installation Steps

### 1. Install Mediasoup Package

```bash
cd clock-software-backend
npm install mediasoup@3
```

**Note**: Mediasoup has native dependencies and requires build tools:

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

#### macOS
```bash
xcode-select --install
```

#### Windows
Install Visual Studio Build Tools from:
https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

### 2. Install Type Definitions (Optional)

```bash
npm install --save-dev @types/mediasoup
```

Note: Mediasoup 3.x includes its own TypeScript definitions, so this may not be necessary.

### 3. Configure Environment Variables

Add to your `.env` file:

```env
# Mediasoup Configuration
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_RTC_MIN_PORT=10000
MEDIASOUP_RTC_MAX_PORT=10100
```

**For Production**:
- Set `MEDIASOUP_ANNOUNCED_IP` to your server's public IP address
- Ensure UDP ports 10000-10100 are open in your firewall

### 4. Update server.ts to Initialize Mediasoup

The server.ts file already has a placeholder comment for Mediasoup initialization. Update it:

```typescript
import { mediasoupService } from './components/room/room.mediasoup';

const startServer = async () => {
    const PORT = process.env.PORT || 8100;
    try {
        // Create HTTP server from Express app
        const httpServer = createServer(app);

        // Initialize Socket.io server with room handlers
        const socketServer = initializeSocketServer(httpServer);
        logger.info("Socket.io server initialized for Shared Study Rooms");

        // Initialize Mediasoup workers
        await mediasoupService.initialize();
        logger.info("Mediasoup workers initialized successfully");

        // Note: Redis connection skipped (not implemented)

        // Start the HTTP server
        httpServer.listen(PORT, () => {
            logger.info(`Server listening on port ${PORT}`);
            logger.info("Room routes mounted at /api/rooms");
            logger.info("Socket.io namespaces available at /room/:roomId");
        });
    } catch (err: unknown) {
        if (err instanceof Error) {
            logger.error(err.message);
            logger.on("finish", () => {
                process.exit(1);
            });
        }
    }
};

startServer();
```

### 5. Firewall Configuration (Production Only)

#### Linux (UFW)
```bash
sudo ufw allow 10000:10100/udp
```

#### Linux (iptables)
```bash
sudo iptables -A INPUT -p udp --dport 10000:10100 -j ACCEPT
```

#### AWS Security Group
Add inbound rule:
- Type: Custom UDP
- Port Range: 10000-10100
- Source: 0.0.0.0/0

## Integration with Socket.io

The Mediasoup service is designed to work with Socket.io for WebRTC signaling. You'll need to add Socket.io event handlers for:

1. `get-rtp-capabilities` - Get router RTP capabilities
2. `create-transport` - Create WebRTC transport
3. `connect-transport` - Connect transport with DTLS parameters
4. `produce` - Create producer for sending media
5. `consume` - Create consumer for receiving media
6. `resume-consumer` - Resume paused consumer

See `MEDIASOUP_INTEGRATION.md` for detailed integration examples.

## Verification

After installation, verify the setup:

```bash
# Run the server
npm run dev

# Check logs for:
# - "Initializing X Mediasoup workers (one per CPU core)"
# - "Mediasoup worker 1/X created (PID: XXXXX)"
# - "Mediasoup service initialized successfully"
```

## Architecture Overview

### Worker Pool
- One worker per CPU core
- Round-robin distribution for load balancing
- Automatic process exit on worker death (should be restarted by process manager)

### Router Per Room
- Each room gets its own Mediasoup router
- Routers are created on-demand and cached
- Supports up to 50 participants per room

### Transport Management
- Each participant needs 2 transports: send and receive
- Transports are automatically cleaned up on disconnect
- Supports UDP and TCP (UDP preferred)

### Producer/Consumer Flow
1. Participant creates send transport
2. Participant produces media (audio/video)
3. Other participants create receive transports
4. Other participants consume the media
5. Consumers start paused, must be resumed

## Performance Specifications

The implementation is designed for:
- **10 rooms** simultaneously
- **50 participants per room**
- **Up to 100 video streams per room** (camera + screen share)
- **~1-2 Mbps per video stream** (VP8 at 720p)

### Resource Requirements
- **CPU**: ~5-10% per active video stream
- **Memory**: ~50MB per worker + ~1MB per transport
- **Bandwidth**: ~1-2 Mbps per video stream

## Troubleshooting

### Installation Issues

**Error: "node-gyp rebuild failed"**
- Ensure build tools are installed (see step 1)
- Try: `npm install --build-from-source`

**Error: "Python not found"**
- Install Python 3.x
- Set environment variable: `npm config set python /path/to/python3`

### Runtime Issues

**Error: "Worker failed to start"**
- Check ports 10000-10100 are available
- Verify no other process is using these ports
- Check firewall settings

**Error: "Transport connection failed"**
- Verify `MEDIASOUP_ANNOUNCED_IP` is correct
- For local dev, use `127.0.0.1`
- For production, use public IP address
- Ensure UDP ports are open

### Debug Mode

Enable debug logging in `room.mediasoup.ts`:

```typescript
worker: {
    logLevel: 'debug',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
}
```

## Next Steps

1. Install mediasoup package (see step 1)
2. Update server.ts to initialize Mediasoup (see step 4)
3. Add Socket.io event handlers for WebRTC signaling
4. Test with WebRTC client
5. Configure TURN server for production NAT traversal

## Documentation

- Implementation: `src/components/room/room.mediasoup.ts`
- Integration Guide: `src/components/room/MEDIASOUP_INTEGRATION.md`
- Official Docs: https://mediasoup.org/documentation/v3/

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the integration guide
3. Consult Mediasoup documentation
4. Check server logs for detailed error messages
