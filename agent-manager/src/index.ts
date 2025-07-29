#!/usr/bin/env node

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = 3081;

app.use(express.json());

// 1. Is the agent running?
app.get('/status', async (req, res) => {
  try {
    const { stdout } = await execAsync('systemctl is-active backend-ai-agent');
    const running = stdout.trim() === 'active';
    res.json({ running });
  } catch {
    res.json({ running: false });
  }
});

// 2. Start the agent
app.post('/start', async (req, res) => {
  try {
    await execAsync('systemctl start backend-ai-agent');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Stop the agent
app.post('/stop', async (req, res) => {
  try {
    await execAsync('systemctl stop backend-ai-agent');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Update the agent
app.post('/update', async (req, res) => {
  const { version } = req.body;
  
  if (!version) {
    return res.status(400).json({ success: false, error: 'Version required' });
  }
  
  try {
    // Update script will handle download, stop, update, start
    await execAsync(`/opt/ai-agent/update-agent.sh ${version}`);
    res.json({ success: true, version });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.send('OK');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Agent Manager listening on port ${PORT}`);
  console.log('Endpoints: /status, /start, /stop, /update');
});