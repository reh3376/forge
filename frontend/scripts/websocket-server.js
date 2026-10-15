#!/usr/bin/env node

const WebSocket = require('ws');

const PORT = 3001;

// Create WebSocket server
const wss = new WebSocket.Server({ 
  port: PORT,
  path: '/ws'
});

console.log(`🔌 WebSocket server running on ws://localhost:${PORT}/ws`);

// Store connected clients
const clients = new Set();

// Manufacturing data simulation
const equipmentData = {
  'mash-tank-01': { status: 'running', temperature: 185, pressure: 18, level: 75 },
  'fermenter-02': { status: 'idle', temperature: 85, pressure: 12, level: 60 },
  'still-01': { status: 'maintenance', temperature: 200, pressure: 20, level: 45 },
  'barrel-line-01': { status: 'running', temperature: 70, pressure: 15, level: 90 }
};

const batchData = {
  'BATCH-2024-001': { status: 'fermenting', phLevel: 4.2, temperature: 85, gravity: 1.045 },
  'BATCH-2024-002': { status: 'mashing', phLevel: 4.5, temperature: 180, gravity: 1.050 },
  'BATCH-2024-003': { status: 'distilling', phLevel: 4.1, temperature: 200, gravity: 1.040 }
};

// Handle new connections
wss.on('connection', (ws, req) => {
  console.log(`📱 New client connected from ${req.socket.remoteAddress}`);
  clients.add(ws);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection',
    data: { message: 'Connected to MES WebSocket server' },
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received message:`, message);
      
      // Echo the message back to all clients (including sender)
      broadcast(message);
      
      // If it's a simulation message, update our mock data
      if (message.type === 'equipment_update' && message.data) {
        const { id, status, temperature, pressure, level } = message.data;
        if (equipmentData[id]) {
          equipmentData[id] = { 
            ...equipmentData[id], 
            status, 
            ...(temperature && { temperature }),
            ...(pressure && { pressure }),
            ...(level && { level })
          };
        }
      }
      
      if (message.type === 'batch_update' && message.data) {
        const { id, status, qualityMetrics } = message.data;
        if (batchData[id]) {
          batchData[id] = { 
            ...batchData[id], 
            status,
            ...(qualityMetrics && qualityMetrics)
          };
        }
      }
      
    } catch (error) {
      console.error('❌ Error parsing message:', error);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('📱 Client disconnected');
    clients.delete(ws);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast message to all connected clients
function broadcast(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Simulate periodic equipment updates
function simulateEquipmentUpdates() {
  const equipmentIds = Object.keys(equipmentData);
  const randomId = equipmentIds[Math.floor(Math.random() * equipmentIds.length)];
  const equipment = equipmentData[randomId];
  
  // Randomly vary the values slightly
  const message = {
    type: 'equipment_update',
    data: {
      id: randomId,
      status: equipment.status,
      temperature: equipment.temperature + Math.round((Math.random() - 0.5) * 10),
      pressure: equipment.pressure + Math.round((Math.random() - 0.5) * 2),
      level: Math.max(0, Math.min(100, equipment.level + Math.round((Math.random() - 0.5) * 5)))
    },
    timestamp: new Date().toISOString()
  };
  
  broadcast(message);
  console.log(`🔄 Simulated equipment update for ${randomId}`);
}

// Simulate periodic batch updates
function simulateBatchUpdates() {
  const batchIds = Object.keys(batchData);
  const randomId = batchIds[Math.floor(Math.random() * batchIds.length)];
  const batch = batchData[randomId];
  
  const message = {
    type: 'batch_update',
    data: {
      id: randomId,
      status: batch.status,
      qualityMetrics: {
        phLevel: Math.round((batch.phLevel + (Math.random() - 0.5) * 0.2) * 100) / 100,
        temperature: batch.temperature + Math.round((Math.random() - 0.5) * 5),
        gravity: Math.round((batch.gravity + (Math.random() - 0.5) * 0.005) * 1000) / 1000
      }
    },
    timestamp: new Date().toISOString()
  };
  
  broadcast(message);
  console.log(`🔄 Simulated batch update for ${randomId}`);
}

// Simulate periodic alerts
function simulateAlerts() {
  const alertTypes = ['warning', 'error', 'info'];
  const alertMessages = [
    'Temperature threshold exceeded',
    'Low pressure detected',
    'Batch quality check required',
    'Equipment maintenance scheduled',
    'Production target achieved'
  ];
  
  const randomType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
  const randomMessage = alertMessages[Math.floor(Math.random() * alertMessages.length)];
  
  const message = {
    type: 'alert',
    data: {
      id: `alert-${Date.now()}`,
      type: randomType,
      message: randomMessage,
      equipmentId: Object.keys(equipmentData)[Math.floor(Math.random() * Object.keys(equipmentData).length)],
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  };
  
  broadcast(message);
  console.log(`🚨 Simulated ${randomType} alert: ${randomMessage}`);
}

// Start simulation intervals (only if there are connected clients)
setInterval(() => {
  if (clients.size > 0) {
    // Equipment updates every 10 seconds
    if (Math.random() > 0.3) {
      simulateEquipmentUpdates();
    }
    
    // Batch updates every 15 seconds
    if (Math.random() > 0.5) {
      simulateBatchUpdates();
    }
    
    // Alerts occasionally
    if (Math.random() > 0.9) {
      simulateAlerts();
    }
  }
}, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});

console.log('🚀 WebSocket server ready for connections');
console.log('📊 Simulating manufacturing data updates every 10 seconds');
console.log('🔧 Press Ctrl+C to stop the server'); 