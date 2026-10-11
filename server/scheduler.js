import cron from 'node-cron';
import { StartInstancesCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';
import db from './db.js';
import * as aws from './aws.js';
import { decrypt } from './crypto.js';

const IST_OFFSET = 5 * 60 + 30;

function istNow() {
  const n = new Date(Date.now() + IST_OFFSET * 60000);
  return {
    hhmm: `${String(n.getUTCHours()).padStart(2, '0')}:${String(n.getUTCMinutes()).padStart(2, '0')}`,
    date: n.toISOString().slice(0, 10),
  };
}

async function firePerProfile(profileId, fn) {
  const prof = await db.one('SELECT * FROM aws_profiles WHERE id = ?', [profileId]);
  if (!prof) return;
  const accessKey = decrypt(prof.access_key_enc);
  const secretKey = decrypt(prof.secret_key_enc);
  if (!accessKey || !secretKey) return;
  const client = aws.makeClient({ accessKey, secretKey, region: prof.region });
  await fn(client, { accessKey, secretKey, region: prof.region });
}

async function startInstances(client, ids) {
  if (!ids.length) return;
  await client.send(new StartInstancesCommand({ InstanceIds: ids }));
}

async function stopInstances(client, ids) {
  if (!ids.length) return;
  await client.send(new StopInstancesCommand({ InstanceIds: ids }));
}

function sameDay(lastFired, todayDate) {
  return !!lastFired && String(lastFired).slice(0, 10) === todayDate;
}

async function runScheduler() {
  const now = istNow();

  // Part 1: fixed schedules
  const schedules = await db.query('SELECT * FROM instance_schedules WHERE enabled = ?', [true]);
  for (const row of schedules) {
    if (row.time !== now.hhmm) continue;
    if (sameDay(row.last_fired, now.date)) continue;
    const ids = JSON.parse(row.instance_ids || '[]').filter(Boolean);
    if (!ids.length) continue;
    try {
      await firePerProfile(row.profile_id, async (client) => {
        if (row.action === 'start') await startInstances(client, ids);
        else await stopInstances(client, ids);
      });
      await db.query('UPDATE instance_schedules SET last_fired = ? WHERE id = ?', [now.date, row.id]);
      console.log(`[scheduler] schedule ${row.id} "${row.name}" ${row.action} @ ${row.time} → ${ids}`);
    } catch (e) {
      console.error(`[scheduler] schedule ${row.id} failed:`, e.message);
    }
  }

  // Part 2: per-instance auto config
  const configs = await db.query('SELECT * FROM instance_auto_config WHERE auto_enabled = ?', [true]);
  const byProfile = {};
  for (const c of configs) (byProfile[c.profile_id] = byProfile[c.profile_id] || []).push(c);

  for (const pid of Object.keys(byProfile)) {
    const cfgs = byProfile[pid];
    try {
      await firePerProfile(Number(pid), async (client, creds) => {
        const instances = await aws.listInstances(client);
        const stateMap = Object.fromEntries(instances.map((i) => [i.id, i.state]));

        for (const c of cfgs) {
          const shouldOn = c.on_time && c.on_time.slice(0, 5) === now.hhmm && !sameDay(c.last_on_fired, now.date);
          const shouldOff = c.off_time && c.off_time.slice(0, 5) === now.hhmm && !sameDay(c.last_off_fired, now.date);
          const st = stateMap[c.instance_id];

          try {
            if (shouldOn && st !== 'running') {
              await startInstances(client, [c.instance_id]);
              await db.query('UPDATE instance_auto_config SET last_on_fired = ? WHERE id = ?', [now.date, c.id]);
              console.log(`[scheduler] auto ON ${c.instance_id}`);
            }
            if (shouldOff && st === 'running') {
              await stopInstances(client, [c.instance_id]);
              await db.query('UPDATE instance_auto_config SET last_off_fired = ? WHERE id = ?', [now.date, c.id]);
              console.log(`[scheduler] auto OFF ${c.instance_id}`);
            }
            // shrink only after stop has landed (instance now stopped) and off fired today
            if (c.shrink_enabled && c.off_time && stateMap[c.instance_id] === 'stopped' && sameDay(c.last_off_fired, now.date) && now.hhmm !== c.off_time.slice(0, 5) && !sameDay(c.shrunk_on, now.date)) {
              const msg = await aws.shrinkInstanceType(client, { instanceId: c.instance_id, region: creds.region });
              await db.query('UPDATE instance_auto_config SET shrunk_on = ? WHERE id = ?', [now.date, c.id]);
              console.log(`[scheduler] auto shrink ${c.instance_id}: ${msg}`);
            }
          } catch (e) {
            console.error(`[scheduler] auto config ${c.id} (${c.instance_id}) error:`, e.message);
          }
        }
      });
    } catch (e) {
      console.error(`[scheduler] profile ${pid} error:`, e.message);
    }
  }
}

let running = false;

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await runScheduler();
    } catch (e) {
      console.error('[scheduler] run error:', e.message);
    } finally {
      running = false;
    }
  });
  console.log('[scheduler] every-minute cron started');
}