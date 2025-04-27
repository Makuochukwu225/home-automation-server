const express = require('express');
const WebSocket = require('ws');
const http = require('http');

// Set up the Express app
const app = express();
const server = http.createServer(app);

// Parse JSON body for REST API
app.use(express.json());

// Set up the WebSocket server
const wss = new WebSocket.Server({ server });

// Store device states and pins
let devices = {};

// Handle incoming WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Give the client a unique ID to track it
    ws.id = Math.random().toString(36).substring(2, 15);

    // Send the device list to the newly connected client
    sendDeviceList(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data);

            // Handle device info registration
            if (data.type === 'device_info') {
                const deviceId = data.id;
                console.log(`Received device info from: ${deviceId}`);

                // Store device pin info in the device object
                devices[deviceId] = {
                    id: deviceId,
                    pins: data.pins,
                    capabilities: data.capabilities || '',
                    lastSeen: new Date().toISOString(),
                    ws: ws  // Store WebSocket connection to allow communication with this device
                };

                // Acknowledge device info reception
                ws.send(JSON.stringify({ type: 'device_info_ack', id: deviceId }));

                // Send updated device list to all clients
                broadcastDeviceList();
            }

            // Handle pin state update
            else if (data.type === 'pin_state_update') {
                const { id, pinId, state } = data;
                console.log(`Pin state update from ${id}: Pin ${pinId} -> ${state}`);

                if (devices[id]) {
                    // Find the pin in the device's pins array
                    const pinIndex = devices[id].pins.findIndex(pin => pin.id === pinId);

                    if (pinIndex !== -1) {
                        // Update the pin state
                        devices[id].pins[pinIndex].state = state;
                        devices[id].pins[pinIndex].value = state === "HIGH";
                        console.log(`Updated pin ${pinId} of device ${id} to ${state}`);

                        // Update lastSeen
                        devices[id].lastSeen = new Date().toISOString();

                        // Broadcast the updated pin state to all clients except the sender
                        broadcastPinStateUpdate(id, pinId, state, ws);
                    }
                }
            }

            // Handle commands to toggle pin state
            else if (data.type === 'command' && data.command === 'toggle_pin') {
                const { deviceId, pinId, state } = data;
                console.log(`Command to toggle pin ${pinId} of device ${deviceId} to ${state}`);

                // Find the target device
                const device = devices[deviceId];

                if (device && device.ws) {
                    // Send toggle command to the device
                    device.ws.send(JSON.stringify({
                        type: 'command',
                        command: 'toggle_pin',
                        pinId: pinId,
                        state: state  // Send the requested state
                    }));

                    // Send acknowledgment back to the sender
                    ws.send(JSON.stringify({
                        type: 'command_ack',
                        command: 'toggle_pin',
                        deviceId: deviceId,
                        pinId: pinId,
                        state: state,
                        message: 'Command sent to device'
                    }));
                } else {
                    // Device not found or not connected
                    ws.send(JSON.stringify({
                        type: 'error',
                        command: 'toggle_pin',
                        deviceId: deviceId,
                        pinId: pinId,
                        message: device ? 'Device not connected' : 'Device not found'
                    }));
                }
            }  // In your WebSocket message handler
            else if (data.type === "sensor_data" && data.id && data.sensor) {
                const deviceId = data.id;
                const sensorType = data.sensor;
                const value = data.value;

                console.log(`Sensor data from ${deviceId}: ${sensorType} = ${value}`);

                // Update the device status
                if (devices[deviceId]) {
                    // Initialize status object if it doesn't exist
                    if (!devices[deviceId].status) {
                        devices[deviceId].status = {};
                    }

                    // Store the sensor value
                    devices[deviceId].status[sensorType] = value;

                    // Broadcast the sensor update to all clients
                    broadcastSensorUpdate(deviceId, sensorType, value);
                }
            }

        } catch (err) {
            console.error('Error handling message:', err);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    // Handle WebSocket disconnects
    ws.on('close', () => {
        console.log('Client disconnected:', ws.id);

        // Check if this was a device connection
        for (const [id, device] of Object.entries(devices)) {
            if (device.ws === ws) {
                console.log(`Device ${id} disconnected`);
                // Mark the device as offline but keep its last state
                device.online = false;
                device.ws = null;
                break;
            }
        }

        // Send the updated device list to all clients
        broadcastDeviceList();
    });
});

// Broadcast pin state updates to all connected clients except the sender
function broadcastPinStateUpdate(deviceId, pinId, state, excludeWs = null) {
    const message = JSON.stringify({
        type: 'pin_state_update',
        deviceId: deviceId,
        pinId: pinId,
        state: state,
        value: state === "HIGH"
    });

    // Send message to all clients except the one provided
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Broadcast the updated devices list to all connected clients
function broadcastDeviceList() {
    // Create a client-friendly version of the devices object
    const deviceList = Object.values(devices).map(device => ({
        id: device.id,
        pins: device.pins,
        capabilities: device.capabilities || '',
        lastSeen: device.lastSeen,
        online: !!device.ws
    }));

    const message = JSON.stringify({
        type: 'devices_list',
        devices: deviceList
    });

    // Send the device list to all connected clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Add this function if not already present
function broadcastSensorUpdate(deviceId, sensorType, value) {
    const message = JSON.stringify({
        type: "sensor_update",
        deviceId: deviceId,
        sensor: sensorType,
        value: value
    });

    // Send to all connected clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Send the device list to a specific client
function sendDeviceList(ws) {
    // Create a client-friendly version of the devices object
    const deviceList = Object.values(devices).map(device => ({
        id: device.id,
        pins: device.pins,
        capabilities: device.capabilities || '',
        lastSeen: device.lastSeen,
        online: !!device.ws
    }));

    const message = JSON.stringify({
        type: 'devices_list',
        devices: deviceList
    });

    console.log('Sending device list to client:', deviceList);
    ws.send(message);
}

// REST API endpoint to get all devices
app.get('/api/devices', (req, res) => {
    // Create a client-friendly version of the devices object
    const deviceList = Object.values(devices).map(device => ({
        id: device.id,
        pins: device.pins,
        capabilities: device.capabilities || '',
        lastSeen: device.lastSeen,
        online: !!device.ws
    }));

    res.json({ devices: deviceList });
});

// REST API endpoint to send commands to devices
app.post('/api/devices/:deviceId/command', (req, res) => {
    const { deviceId } = req.params;
    const { command, pinId, state } = req.body;

    // Find the target device
    const device = devices[deviceId];

    if (!device) {
        return res.status(404).json({ error: 'Device not found' });
    }

    if (!device.ws) {
        return res.status(503).json({ error: 'Device not connected' });
    }

    // Send command to the device
    device.ws.send(JSON.stringify({
        type: 'command',
        command: command,
        pinId: pinId,
        state: state
    }));

    res.json({
        success: true,
        message: 'Command sent to device',
        deviceId,
        command,
        pinId,
        state
    });
});

// Start the server on port 8080
server.listen(8080, () => {
    console.log('Server started on http://localhost:8080');
    console.log('WebSocket server available at ws://localhost:8080');
});
